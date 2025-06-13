
import NextAuth, { type NextAuthOptions, type AuthProvider, type Adapter } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from './mongodb';
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
  console.info("INFO: Google OAuth Provider configured.");
} else {
  console.warn("WARNING: Google OAuth credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET) not found in .env. Google login will be disabled.");
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'repo read:user user:email',
        },
      },
    })
  );
  console.info("INFO: GitHub OAuth Provider configured.");
} else {
  console.warn("WARNING: GitHub OAuth credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) not found in .env. GitHub login will be disabled.");
}

if (providers.length === 0) {
  // This check is good, but throwing an error here might be too aggressive if one provider is optional.
  // Consider if the app can run with zero providers (e.g., if only credential auth was planned later).
  // For now, will log a critical error.
  console.error('CRITICAL ERROR: No OAuth providers configured. Login will not function. Please provide credentials for at least one provider (e.g., Google or GitHub) in your .env file.');
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
        token.accessToken = account.access_token;
        token.provider = account.provider;
        // Ensure user.id from the adapter is correctly assigned to token.id
        if (user.id && typeof user.id === 'string' && mongoose.Types.ObjectId.isValid(user.id)) {
          token.id = user.id;
        } else if (profile?.email) {
          // Fallback to lookup by email if user.id is not directly available or invalid
          const dbUserByEmail = await UserModel.findOne({ email: profile.email }).select('_id').lean();
          if (dbUserByEmail) {
            token.id = dbUserByEmail._id.toString();
          } else {
            // Should not happen if user creation worked, but good to clear if no ID found
            console.warn(`[JWT Callback] User with email ${profile.email} not found in DB during initial sign-in for ID assignment.`);
            delete token.id;
          }
        } else {
            console.warn(`[JWT Callback] Could not determine user ID during initial sign-in.`);
            delete token.id;
        }
      }

      // This part runs on every JWT creation/update (sign-in, session checks if updateAge is hit, etc.)
      // This is where the role is refreshed from the DB if token.id exists.
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role; // CRITICAL: Always fetch the latest role from DB
          token.status = dbUser.status;
          token.email = dbUser.email; // Refresh email in token too

          // First user promotion logic (only on initial sign-in with 'account' present)
          if (account && token.role !== 'admin') { // Check if 'account' exists (initial sign-in) and current role is not already admin
            const userCount = await UserModel.countDocuments();
            if (userCount === 1) { // If this is the very first user
              console.log(`[JWT Callback] Promoting first user ${token.email} (ID: ${token.id}) to admin.`);
              await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
              token.role = 'admin'; // Update role in token
              token.status = 'active'; // Ensure status is active for the new admin
            }
          }
        } else {
          // User ID in token, but no user in DB (e.g., user deleted manually)
          console.warn(`[JWT Callback] User with ID ${token.id} (from token) not found in DB. Clearing role/status.`);
          delete token.role;
          delete token.status;
          delete token.email;
          // delete token.id; // Consider if invalidating token is desired
        }
      } else if (token.id) {
        // token.id exists but is not a valid ObjectId string. This is an anomaly.
        console.error(`[JWT Callback] Invalid token.id format: ${token.id}. Clearing sensitive token fields.`);
        delete token.id;
        delete token.role;
        delete token.status;
        delete token.email;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.accessToken && session) { // Ensure session exists
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) { // Ensure session.user exists
        session.user.id = token.id as string;
      }
      if (token.role && session.user) {
        session.user.role = token.role as 'user' | 'admin';
      }
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      }
      if (token.email && session.user) { // Ensure email is set if available in token
        session.user.email = token.email as string;
      } else if (session.user && !token.email) { // Ensure email is removed if not in token
         delete session.user.email;
      }
      return session;
    },
    
    async signIn({ user, account, profile }) {
      await connectMongoose();

      if (!account || !profile?.email) {
        // This can happen in credentials auth or if OAuth profile is incomplete.
        // Check for existing user by ID if available.
        if (user?.id && typeof user.id === 'string' && mongoose.Types.ObjectId.isValid(user.id)) {
          const dbUser = await UserModel.findById(user.id).select('status').lean();
          if (dbUser?.status === 'suspended') {
            return `/auth/signin?error=suspended&reason=account_issue`;
          }
        }
        return true; // Allow sign-in if it's not an OAuth flow we can fully vet here or if user ID exists and is active
      }

      // Standard OAuth flow, profile.email should exist
      const userByEmail = await UserModel.findOne({ email: profile.email }).select('status _id').lean();

      if (userByEmail?.status === 'suspended') {
        return `/auth/signin?error=suspended&email=${encodeURIComponent(profile.email)}`;
      }
      
      // Check if this OAuth account is already linked to a user, and if that user is suspended
      const linkedOAuthAccount = await AccountModel.findOne({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      }).lean();

      if (linkedOAuthAccount && linkedOAuthAccount.userId) {
         if (mongoose.Types.ObjectId.isValid(linkedOAuthAccount.userId.toString())) {
            const linkedUser = await UserModel.findById(linkedOAuthAccount.userId.toString()).select('status email').lean();
            if (linkedUser?.status === 'suspended') {
              // Account is linked to a suspended user.
              return `/auth/signin?error=suspended&provider=${account.provider}&reason=linked_account_suspended`;
            }
        }
      }
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin', // Redirect OAuth errors to signin page with error query param
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
    
