
import NextAuth, { type NextAuthOptions, type AuthProvider, type Adapter } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from './mongodb'; // Ensures MONGODB_URI is checked by mongodb.ts
import { User as UserModel, Account as AccountModel, connectMongoose } from './mongodb'; // Import Mongoose User model and AccountModel
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

// Conditionally add GoogleProvider
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
  console.log("INFO: Google OAuth Provider configured.");
} else {
  console.warn("WARNING: Google OAuth credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET) not found in .env. Google login will be disabled.");
}

// Conditionally add GithubProvider
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
  console.log("INFO: GitHub OAuth Provider configured.");
} else {
  console.warn("WARNING: GitHub OAuth credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) not found in .env. GitHub login will be disabled.");
}

if (providers.length === 0) {
  console.error('CRITICAL ERROR: No OAuth providers configured. Login will not function. Please provide credentials for at least one provider (e.g., Google or GitHub) in your .env file and ensure they are correctly named (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET).');
}

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt', // Using JWT for session strategy
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      await connectMongoose();

      if (account && user) { // Initial sign-in
        token.accessToken = account.access_token;
        token.provider = account.provider;

        // The 'user' object is the result of adapter.createUser or adapter.getUserByEmail/Account.
        // Its 'id' should be the MongoDB ObjectId string.
        if (user?.id && typeof user.id === 'string') {
          token.id = user.id;
        } else {
          // This block is a fallback, ideally user.id from adapter is always present and correct.
          console.warn(`[JWT Callback] User ID missing or invalid from adapter user object during initial sign-in. User:`, user, `Account:`, account);
          if (profile?.email) {
            const dbUserByEmail = await UserModel.findOne({ email: profile.email }).select('_id').lean();
            if (dbUserByEmail) {
              token.id = dbUserByEmail._id.toString();
              console.log(`[JWT Callback] Fallback: Found user ID ${token.id} by email ${profile.email}.`);
            } else {
              console.error(`[JWT Callback] CRITICAL FALLBACK FAILURE (Initial Sign-In): User ID missing from adapter, and email ${profile.email} not found in DB. Cannot set token.id.`);
              delete token.id; // Ensure no invalid ID is propagated
            }
          } else {
            console.error(`[JWT Callback] CRITICAL FALLBACK FAILURE (Initial Sign-In): User ID missing from adapter, and profile lacks email. Cannot set token.id.`);
            delete token.id;
          }
        }
      }

      // Populate role, status, and email from DB if token.id is valid
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; // Default to 'user' if somehow not set in DB
          token.status = dbUser.status || 'active'; // Default to 'active'
          token.email = dbUser.email; // Ensure email in token is from DB

          // First user promotion logic (only during initial OAuth sign-in when 'account' is present)
          if (account && token.role !== 'admin') {
            const userCount = await UserModel.countDocuments();
            if (userCount === 1) {
              console.log(`INFO: First user detected (Email: ${dbUser.email}, ID: ${token.id}). Promoting to admin.`);
              try {
                await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
                token.role = 'admin'; // Update token immediately
                token.status = 'active';
              } catch (e: any) {
                console.error(`ERROR: Failed to promote first user ${token.id} to admin: ${e.message}`);
              }
            }
          }
        } else {
          console.warn(`[JWT Callback] User with ID ${token.id} not found in DB. Clearing role/status/email from token.`);
          delete token.role;
          delete token.status;
          delete token.email; // Email from DB is no longer valid
        }
      } else if (token.id) { // token.id exists but is not a valid ObjectId string
        console.warn(`[JWT Callback] Invalid token.id format: ${token.id}. Clearing token id and sensitive fields.`);
        delete token.id;
        delete token.role;
        delete token.status;
        delete token.email;
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
        session.user.role = token.role as string;
      }
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      }
      // Ensure session.user.email reflects the email stored in the token (which came from DB or profile)
      if (token.email && session.user) {
        session.user.email = token.email as string;
      } else if (session.user && !token.email) {
        // If token has no email (e.g., user deleted), remove from session user too
        delete session.user.email;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      await connectMongoose();

      // This callback primarily decides if sign-in is allowed.
      // It doesn't perform the linking itself; the adapter does.
      // The main concern here is checking for suspended users.

      if (!account || !profile?.email) {
        // Not an OAuth flow (e.g. credentials) or profile lacks email.
        // If user object is present (e.g. from credentials provider), check suspension.
        if (user?.id && mongoose.Types.ObjectId.isValid(user.id)) {
            const dbUser = await UserModel.findById(user.id).select('status email').lean();
            if (dbUser?.status === 'suspended') {
                console.log(`Sign-in attempt denied for suspended user (non-OAuth or direct user): ${dbUser.email || 'ID: ' + user.id}`);
                return '/auth/signin?error=suspended';
            }
        }
        return true; // Allow other sign-in methods or if no specific user object to check here.
      }

      // OAuth flow
      // Check 1: User with this email exists and is suspended.
      const userByEmail = await UserModel.findOne({ email: profile.email }).select('status _id').lean();
      if (userByEmail?.status === 'suspended') {
        console.log(`Sign-in attempt denied: User account for email ${profile.email} is suspended.`);
        return `/auth/signin?error=suspended&email=${encodeURIComponent(profile.email)}`;
      }

      // Check 2: If this specific OAuth account (e.g., this GitHub ID) is already linked to a user in our DB,
      // and if *that* user is suspended.
      const linkedOAuthAccount = await AccountModel.findOne({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      }).lean();

      if (linkedOAuthAccount && linkedOAuthAccount.userId) {
        if (!mongoose.Types.ObjectId.isValid(linkedOAuthAccount.userId.toString())) {
             console.warn(`[signIn Callback] Found linked OAuth account with invalid userId format: ${linkedOAuthAccount.userId}. Proceeding cautiously.`);
        } else {
            const linkedUser = await UserModel.findById(linkedOAuthAccount.userId.toString()).select('status email').lean();
            if (linkedUser?.status === 'suspended') {
              console.log(`Sign-in attempt denied: OAuth account ${account.provider}:${account.providerAccountId} is linked to suspended user ${linkedUser.email}.`);
              return `/auth/signin?error=suspended&provider=${account.provider}`;
            }
        }
      }
      
      // If we've reached here:
      // - EITHER the user (by email) is not suspended.
      // - OR the OAuth account is not yet linked, or it's linked to a non-suspended user.
      // Allow NextAuth.js to proceed with its default linking/creation logic.
      // The E11000 error the user is seeing happens *during* this default NextAuth flow
      // when the adapter's `linkAccount` (which does `Account.create()`) is called and
      // an orphaned `accounts` document already exists for that provider + providerAccountId.
      // This `signIn` callback cannot prevent that E11000 if the DB state is inconsistent.
      // The user *must* clean the orphaned `accounts` document from their database.
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
    
