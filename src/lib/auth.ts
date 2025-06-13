
import NextAuth, { type NextAuthOptions, type AuthProvider, type Adapter } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from './mongodb'; // Adjusted import path for clientPromise
import { User as UserModel, Account as AccountModel, connectMongoose } from './mongodb';
import mongoose from 'mongoose';

// Check critical NextAuth environment variables first
if (!process.env.NEXTAUTH_URL) {
  const errorMessage = 'CRITICAL ERROR: Missing NEXTAUTH_URL environment variable. This is required for NextAuth to function correctly. Set it to your application\'s deployed URL (e.g., https://myapp.vercel.app) or http://localhost:PORT for local development (e.g., http://localhost:9002). Application will not start.';
  console.error(errorMessage);
  throw new Error(errorMessage);
}

if (!process.env.NEXTAUTH_SECRET) {
  const errorMessage = 'CRITICAL ERROR: Missing NEXTAUTH_SECRET environment variable. Authentication will not work securely. Generate a strong, random string for this value (e.g., using `openssl rand -base64 32` in your terminal). Application will not start.';
  console.error(errorMessage);
  throw new Error(errorMessage);
}

const providers: AuthProvider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
  console.info("[Auth Setup] Google OAuth Provider configured.");
} else {
  console.warn("[Auth Setup] WARNING: Google OAuth credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET) not found in .env. Google login will be disabled.");
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'repo read:user user:email', // Request necessary scopes
        },
      },
    })
  );
  console.info("[Auth Setup] GitHub OAuth Provider configured.");
} else {
  console.warn("[Auth Setup] WARNING: GitHub OAuth credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) not found in .env. GitHub login will be disabled.");
}

if (providers.length === 0) {
  console.error('[Auth Setup] CRITICAL ERROR: No OAuth providers configured. Login will not function. Please provide credentials for at least one provider in your .env file.');
}


export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      await connectMongoose();

      // This part runs on initial sign-in
      if (account && user) {
        console.log("[JWT Callback] Initial sign-in. Account:", account.provider, "User from adapter:", user);
        token.accessToken = account.access_token;
        token.provider = account.provider;

        // user.id from the adapter is MongoDB _id.toString()
        if (user.id) {
          token.id = user.id; // This is the MongoDB _id as a string
          token.sub = user.id; // Standard 'sub' claim
          console.log(`[JWT Callback] User ID from adapter: ${user.id} assigned to token.id and token.sub.`);
        } else if (profile?.email) {
          // Fallback: This should ideally not be needed if adapter works correctly.
          console.warn(`[JWT Callback] User.id not directly available from adapter for ${profile.email}. Attempting email lookup.`);
          const dbUserByEmail = await UserModel.findOne({ email: profile.email }).select('_id').lean();
          if (dbUserByEmail) {
            token.id = dbUserByEmail._id.toString();
            token.sub = dbUserByEmail._id.toString();
            console.log(`[JWT Callback] User ID from email lookup: ${token.id} assigned to token.id and token.sub.`);
          } else {
            console.error(`[JWT Callback] CRITICAL: User with email ${profile.email} not found in DB during initial sign-in ID assignment.`);
          }
        } else {
            console.error(`[JWT Callback] CRITICAL: Could not determine user ID during initial sign-in. User object:`, user, "Profile:", profile);
        }
      }

      // This part runs on every JWT creation/update
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role;
          token.status = dbUser.status;
          token.email = dbUser.email; // Refresh email in token
          console.log(`[JWT Callback] Refreshed role: ${token.role}, status: ${token.status} for user ID: ${token.id}`);

          // First user promotion logic (only on initial sign-in with 'account' present)
          if (account && token.role !== 'admin') {
            const userCount = await UserModel.countDocuments();
            if (userCount === 1) {
              console.log(`[JWT Callback] Promoting first user ${token.email} (ID: ${token.id}) to admin.`);
              await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
              token.role = 'admin';
              token.status = 'active';
            }
          }
        } else {
          console.warn(`[JWT Callback] User with ID ${token.id} (from token) not found in DB. Clearing role/status/email from token.`);
          delete token.role;
          delete token.status;
          delete token.email;
          // Optionally, consider invalidating the token further if user is deleted.
          // delete token.id; delete token.sub; // This would effectively log them out on next check.
        }
      } else if (token.id) {
        console.error(`[JWT Callback] Invalid token.id format: ${token.id}. Clearing sensitive token fields.`);
        delete token.id; delete token.sub; delete token.role; delete token.status; delete token.email;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.accessToken && session) {
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      if (token.role && session.user) {
        session.user.role = token.role as 'user' | 'admin';
      }
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      }
      if (token.email && session.user) {
        session.user.email = token.email as string;
      } else if (session.user && !token.email) {
         delete session.user.email;
      }
      // console.log("[Session Callback] Session object created/updated:", session);
      return session;
    },
    
    async signIn({ user, account, profile }) {
      await connectMongoose();
      console.log(`[SignIn Callback] Attempting sign-in for user: ${user?.email || profile?.email}, account provider: ${account?.provider}`);

      // Handle cases where profile or email might be missing (e.g. credentials provider - not used here but good practice)
      if (!account || !profile?.email) {
        console.log(`[SignIn Callback] Missing account or profile.email. User:`, user, `Account:`, account, `Profile:`, profile);
        if (user?.id && typeof user.id === 'string' && mongoose.Types.ObjectId.isValid(user.id)) {
            const dbUserByProvidedId = await UserModel.findById(user.id).select('status').lean();
            if (dbUserByProvidedId?.status === 'suspended') {
                console.warn(`[SignIn Callback] Denied: Attempt to sign in by suspended user (ID from user object: ${user.id}).`);
                return `/auth/signin?error=AccountSuspended&reason=user_suspended_by_id`;
            }
        }
        console.log(`[SignIn Callback] Allowed: Non-OAuth flow or partial data, proceeding.`);
        return true;
      }

      // Standard OAuth flow, profile.email should exist
      const dbUserByEmail = await UserModel.findOne({ email: profile.email }).select('status _id').lean();

      if (dbUserByEmail) {
        console.log(`[SignIn Callback] Found existing user by email: ${profile.email}, ID: ${dbUserByEmail._id}, Status: ${dbUserByEmail.status}`);
        if (dbUserByEmail.status === 'suspended') {
          console.warn(`[SignIn Callback] Denied: Account for email ${profile.email} is suspended.`);
          return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(profile.email)}`;
        }
      } else {
        console.log(`[SignIn Callback] No existing user found for email: ${profile.email}. New user will be created by adapter.`);
      }
      
      const linkedOAuthAccount = await AccountModel.findOne({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      }).lean();

      if (linkedOAuthAccount) {
        console.log(`[SignIn Callback] Found existing OAuth account link for ${account.provider}/${account.providerAccountId}, linked to userId: ${linkedOAuthAccount.userId}`);
         if (linkedOAuthAccount.userId && mongoose.Types.ObjectId.isValid(linkedOAuthAccount.userId.toString())) {
            const linkedUser = await UserModel.findById(linkedOAuthAccount.userId.toString()).select('status email').lean();
            if (linkedUser?.status === 'suspended') {
              console.warn(`[SignIn Callback] Denied: OAuth account (${account.provider}/${account.providerAccountId}) is linked to a suspended user (Email: ${linkedUser.email}).`);
              return `/auth/signin?error=AccountSuspended&provider=${account.provider}&reason=linked_account_already_suspended`;
            }
            // If the OAuth account is already linked to an active user,
            // and that user's email matches the profile email, this is a normal sign-in.
            if (linkedUser && dbUserByEmail && linkedUser._id.toString() === dbUserByEmail._id.toString()) {
                 console.log(`[SignIn Callback] Allowed: Existing user (Email: ${profile.email}) signing in with already linked OAuth account (${account.provider}).`);
                 return true;
            }
            // If the emails don't match, or dbUserByEmail wasn't found but linkedUser was,
            // it could indicate an attempt to link an already taken OAuth account to a different email,
            // or signing in with an OAuth account whose primary user record was deleted.
            // NextAuth's default behavior usually handles "OAuthAccountNotLinked" if this OAuth account is recognized but user context is mismatched.
            // The E11000 occurs when the adapter tries to create a *new* link for this OAuth provider/ID.
         }
      } else {
        console.log(`[SignIn Callback] No existing OAuth account link found for ${account.provider}/${account.providerAccountId}. Adapter will attempt to link/create.`);
      }
      
      // If we reach here, the adapter will attempt to:
      // 1. Find user by email.
      // 2. If found, link this OAuth account to them.
      // 3. If not found, create a new user, then link this OAuth account.
      // The E11000 you're seeing means step 2 or 3's "link" part fails because an 'accounts' doc for this provider/providerAccountId *already exists*.
      // This signifies an orphaned 'accounts' record.
      console.log(`[SignIn Callback] Proceeding: NextAuth adapter will handle user creation/linking for ${profile.email} with ${account.provider}.`);
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin', 
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
    
    