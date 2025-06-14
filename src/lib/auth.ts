
import NextAuth, { type NextAuthOptions, type AuthProvider, type Adapter } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise, { User as UserModel, connectMongoose } from './mongodb'; // UserModel for direct DB interaction
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
          scope: 'repo read:user user:email',
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
      // console.log(`[JWT Callback Entry] token.id: ${token.id}, user?.id: ${user?.id}, account: ${!!account}`);

      // This block handles the initial sign-in flow or when user object is passed (e.g. by adapter)
      if (account && user && user.id) {
        // The `user.id` from the adapter IS the MongoDB `_id`.
        // We fetch the user from DB to ensure we have the most current role, status, etc.
        // This also verifies the user exists in the DB.
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.id = dbUser._id.toString(); // Ensure it's a string for consistency
          token.sub = dbUser._id.toString();
          token.role = dbUser.role || 'user'; // Default to 'user' if somehow null
          token.status = dbUser.status || 'active'; // Default to 'active'
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image;
          if (account.access_token) token.accessToken = account.access_token;
          // console.log(`[JWT Callback - Initial Sign-in] User ${dbUser._id.toString()} processed. Token updated with DB data. Role: ${token.role}, Status: ${token.status}`);
        } else {
          // This case should ideally not be hit if the adapter is working correctly,
          // as `user.id` implies the adapter found/created the user.
          // If it is hit, it means a user ID was provided but the user isn't in the DB.
          console.error(`[JWT Callback - Initial Sign-in] CRITICAL: User with id ${user.id} (from adapter) not found in DB. This should not happen if adapter is correct.`);
          // Clear potentially stale/incorrect info from token
          delete token.id; delete token.sub; delete token.role; delete token.status; delete token.email; delete token.name; delete token.picture; delete token.accessToken;
        }
      }
      // This block handles subsequent JWT validations (session refresh, etc.)
      // It relies on `token.id` having been correctly set to the MongoDB `_id` during initial sign-in.
      else if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image;
          // console.log(`[JWT Callback - Subsequent] Refreshed token for User ID: ${token.id}. Role: ${token.role}, Status: ${token.status}`);
        } else {
          // This is the scenario from the user's log: "User with ID ... not found in DB"
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB. Clearing sensitive fields from token.`);
          delete token.role; delete token.status; delete token.email; delete token.name; delete token.picture;
          // To be more aggressive, one might also delete token.id and token.sub here to force re-authentication,
          // but NextAuth's session strategy might handle this by creating an unauthenticated session.
        }
      } else if (token.id) {
        console.error(`[JWT Callback] Invalid token.id format or missing for subsequent call: '${token.id}'. Clearing sensitive fields.`);
        delete token.id; delete token.sub; delete token.role; delete token.status; delete token.email; delete token.name; delete token.picture;
      }
      // console.log(`[JWT Callback Exit] Final token for id '${token.id}': role='${token.role}', status='${token.status}'`);
      return token;
    },

    async session({ session, token }) {
      // The token object here is the output of the jwt callback
      if (token.accessToken && session) {
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      if (token.role && session.user) {
        session.user.role = token.role as 'user' | 'admin';
      } else if (session.user) { // Ensure role is not undefined in session
        session.user.role = 'user'; // Fallback default if token.role is missing
      }
      
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      } else if (session.user) { // Ensure status is not undefined
        session.user.status = 'active'; // Fallback default if token.status is missing
      }

      if (token.email && session.user) {
        session.user.email = token.email as string;
      } else if (session.user && session.user.email) { // Don't delete if already exists from another source
         // delete session.user.email; 
      }
      
      if (token.name && session.user) {
        session.user.name = token.name as string;
      }
      if (token.picture && session.user) { 
        session.user.image = token.picture as string;
      }
      // console.log("[Session Callback] Session object created/updated:", JSON.stringify(session, null, 2));
      return session;
    },

    async signIn({ user, account, profile }) {
      await connectMongoose();
      const userEmail = user?.email || profile?.email; 
      const provider = account?.provider || 'unknown';
      // console.log(`[SignIn Callback] Attempting sign-in for email: '${userEmail}', Provider: '${provider}'`);

      if (!account || !userEmail) {
        console.error(`[SignIn Callback] Denied: Missing account details or profile email for provider '${provider}'.`);
        return `/auth/signin?error=SignInError&reason=missing_provider_details`;
      }

      const dbUser = await UserModel.findOne({ email: userEmail }).select('status role').lean();
      if (dbUser && dbUser.status === 'suspended') {
        console.warn(`[SignIn Callback] Denied: Account for email '${userEmail}' is suspended.`);
        return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(userEmail)}`;
      }
      
      // console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle DB operations. Initial DB role (if user exists): ${dbUser?.role || 'N/A (new user)'}. For new users, schema default ('user') applies.`);
      return true; 
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin', // Redirect to sign-in page on error, showing error query param
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

    