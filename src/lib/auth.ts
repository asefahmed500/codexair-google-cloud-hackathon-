
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

      // On initial sign-in (account and user are present)
      if (account && user && user.id) {
        console.log(`[JWT Callback - Initial Sign-in] User ID from adapter: ${user.id}, Provider: ${account.provider}`);
        token.accessToken = account.access_token;
        token.provider = account.provider;
        token.id = user.id; // This is the MongoDB _id as a string
        token.sub = user.id; // Standard 'sub' claim
      }

      // On subsequent JWT creations/updates, ensure user data is fresh
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        try {
          const dbUser = await UserModel.findById(token.id).select('role email status').lean();
          if (dbUser) {
            token.role = dbUser.role; // Default is 'user' from schema
            token.status = dbUser.status;
            token.email = dbUser.email; // Keep email in token fresh
            
            // First user promotion logic (only if 'account' is present, indicating an initial sign-in flow for this JWT)
            if (account && dbUser.role !== 'admin') { // Check dbUser.role before potential promotion
              const userCount = await UserModel.countDocuments();
              if (userCount === 1) {
                console.log(`[JWT Callback] Promoting first user (ID: ${token.id}, Email: ${dbUser.email}) to admin.`);
                await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
                token.role = 'admin';
                token.status = 'active'; // Ensure status is active for the first admin
              }
            }
            // console.log(`[JWT Callback - Update] Refreshed token for user ID: ${token.id}. Role: ${token.role}, Status: ${token.status}`);
          } else {
            console.warn(`[JWT Callback - Update] User with ID ${token.id} not found in DB. Clearing role/status from token.`);
            delete token.role;
            delete token.status;
            // Potentially invalidate token further if user is deleted.
          }
        } catch (dbError) {
            console.error(`[JWT Callback - Update] Error fetching user from DB for ID ${token.id}:`, dbError);
            delete token.role; delete token.status; delete token.email;
        }
      } else if (token.id) {
        // This case means token.id was present but not a valid ObjectId string.
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
        session.user.email = token.email as string; // Ensure email is passed to session
      } else if (session.user && !token.email) {
         delete session.user.email; // Clean up if email not in token
      }
      // console.log("[Session Callback] Session object created/updated:", JSON.stringify(session, null, 2));
      return session;
    },
    
    async signIn({ user, account, profile }) {
      await connectMongoose();
      const userEmail = user?.email || profile?.email;
      console.log(`[SignIn Callback] Attempting sign-in for email: ${userEmail}, Provider: ${account?.provider}`);

      if (!account || !userEmail) {
        // Should not happen for standard OAuth providers like Google/GitHub after successful auth with them
        console.error(`[SignIn Callback] Denied: Missing account details or profile email. This is unexpected for OAuth. Account: ${JSON.stringify(account)}, Profile: ${JSON.stringify(profile)}`);
        return `/auth/signin?error=SignInError&reason=missing_provider_details`;
      }

      // Check if the user trying to sign in is suspended
      const dbUser = await UserModel.findOne({ email: userEmail }).select('status').lean();
      if (dbUser && dbUser.status === 'suspended') {
        console.warn(`[SignIn Callback] Denied: Account for email ${userEmail} is suspended.`);
        return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(userEmail)}`;
      }
      
      console.log(`[SignIn Callback] Allowed: Email ${userEmail}, Provider: ${account.provider}. Adapter will handle user creation/linking.`);
      // Let the adapter handle user creation and account linking.
      // The E11000 error needs to be resolved by cleaning the database.
      // This callback's main job here is to prevent sign-in for suspended users.
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
    
    

    