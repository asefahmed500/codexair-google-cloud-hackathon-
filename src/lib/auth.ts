
import NextAuth, { type NextAuthOptions, type AuthProvider, type Adapter } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise, { User as UserModel, connectMongoose, Account as AccountModel } from './mongodb'; // AccountModel import added
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
      allowDangerousEmailAccountLinking: true,
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
      allowDangerousEmailAccountLinking: true,
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
    async signIn({ user, account, profile }) {
      // This callback is for access control, not primarily for user creation when using an adapter.
      // The adapter handles creating/linking the user.
      await connectMongoose();
      const userEmail = user?.email || (profile as any)?.email; // (profile as any) to access potential email if not on User type

      if (!userEmail) {
        console.error("[SignIn Callback] Critical: Missing email from OAuth profile.", { user, profile });
        // User will be redirected to an error page by NextAuth if false is returned or an error string starting with /
        return `/auth/signin?error=EmailMissing`;
      }
      console.log(`[SignIn Callback] Attempting sign-in for email: '${userEmail}', Provider: '${account?.provider}'`);

      const existingUserInDB = await UserModel.findOne({ email: userEmail }).select('_id status').lean();

      if (existingUserInDB) {
        console.log(`[SignIn Callback] Existing user found in DB: ${existingUserInDB._id}, Status: ${existingUserInDB.status}`);
        if (existingUserInDB.status === 'suspended') {
          console.warn(`[SignIn Callback] Denied: Account for email '${userEmail}' is suspended.`);
          return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(userEmail)}`;
        }
      } else {
        // User does not exist with this email.
        // The MongoDBAdapter will handle creating the new user with schema defaults (role: 'user', status: 'active').
        console.log(`[SignIn Callback] User with email '${userEmail}' not found in DB. Adapter will create this user.`);
      }
      
      // Return true to allow the sign-in process (and adapter linking/creation) to continue.
      console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle user creation/linking.`);
      return true;
    },

    async jwt({ token, user, account }) {
      await connectMongoose();

      if (account && user && user.id) {
        // Initial sign-in. `user.id` is the MongoDB _id provided by the adapter.
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.id = dbUser._id.toString();
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image; // NextAuth uses 'picture' in token for image
          if (account.access_token) token.accessToken = account.access_token;
          console.log(`[JWT Callback - Initial Sign-in] User ${token.id} processed. Token updated with DB data. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.error(`[JWT Callback - Initial Sign-in] CRITICAL: User with id ${user.id} (from adapter) not found in DB. This might happen if signIn callback failed silently or DB issue.`);
          // Clear token to force re-authentication or show error
          token = {}; // Effectively invalidates the token for session creation
        }
      } else if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        // Subsequent JWT calls, token.id should be the MongoDB _id.
        // Refresh user data from DB to ensure role/status are up-to-date.
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; 
          token.status = dbUser.status || 'active'; 
          token.email = dbUser.email; 
          token.name = dbUser.name; 
          token.picture = dbUser.image; 
          // console.log(`[JWT Callback - Subsequent] Refreshed token for User ID: ${token.id}. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB. Clearing sensitive fields from token.`);
          delete token.role;
          delete token.status;
          // Consider also deleting token.id or other user-specific fields to effectively invalidate the session
          // For now, just clearing role/status. If this leads to issues, might need to clear more.
        }
      }
      return token;
    },

    async session({ session, token }) {
      // The token object here is the output of the jwt callback
      if (token.accessToken) { 
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      
      if (token.role && session.user) {
        session.user.role = token.role as 'user' | 'admin';
      } else if (session.user) {
        session.user.role = 'user'; // Default if not in token (should be, but as a safeguard)
      }
      
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      } else if (session.user) {
        session.user.status = 'active'; // Default if not in token
      }

      // Populate other user fields into the session from the token
      if (token.email && session.user) {
        session.user.email = token.email as string;
      }
      if (token.name && session.user) {
        session.user.name = token.name as string;
      }
      if (token.picture && session.user) { 
        session.user.image = token.picture as string;
      }
      
      return session;
    },
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
    
    
