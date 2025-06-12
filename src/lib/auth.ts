
import NextAuth, { type NextAuthOptions, type AuthProvider } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from './mongodb'; // Ensures MONGODB_URI is checked by mongodb.ts
import type { Adapter } from 'next-auth/adapters';
// import type { User as CustomUser } from '@/types'; // Not directly used here, session type is more relevant
import { User as UserModel, connectMongoose } from './mongodb'; // Import Mongoose User model and connectMongoose

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
  // Depending on app requirements, you might want to throw an error here to halt startup.
}

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt', // Using JWT for session strategy
  },
  callbacks: {
    async jwt({ token, user, account }) {
      await connectMongoose(); 

      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }

      if (user?.id) {
        token.id = user.id;
      }

      if (token.id) {
        const dbUser = await UserModel.findById(token.id).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active'; // Add status to token

          if (user) { 
            const userCount = await UserModel.countDocuments();
            if (userCount === 1 && token.role !== 'admin') {
              console.log(`INFO: First user detected (Email: ${dbUser.email}, ID: ${token.id}). Promoting to admin.`);
              try {
                await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } }); // Ensure first admin is active
                token.role = 'admin';
                token.status = 'active';
                console.log(`INFO: User ${token.id} successfully promoted to admin.`);
              } catch (e: any) {
                console.error(`ERROR: Failed to promote first user ${token.id} to admin: ${e.message}`);
              }
            }
          }
        } else {
          console.warn(`User with ID ${token.id} not found in database during JWT callback.`);
          delete token.role;
          delete token.status;
        }
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
        session.user.status = token.status as 'active' | 'suspended'; // Add status to session
      }
      return session;
    },
    async signIn({ user, account, profile }) {
        await connectMongoose();
        const dbUser = await UserModel.findById(user.id).select('status').lean();
        if (dbUser?.status === 'suspended') {
          // Prevent sign-in for suspended users
          // You can redirect to an 'account suspended' page or simply return false
          console.log(`Sign-in attempt denied for suspended user: ${user.email}`);
          return '/auth/signin?error=suspended'; // Or return false to show generic error
        }
        return true; // Allow sign-in
    }
  },
  pages: {
    signIn: '/auth/signin',
    // signOut: '/auth/signout', 
    // error: '/auth/error', 
    // verifyRequest: '/auth/verify-request', 
    // newUser: null 
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
