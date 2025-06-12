
import NextAuth, { type NextAuthOptions, type AuthProvider } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from './mongodb'; // Ensures MONGODB_URI is checked by mongodb.ts
import type { Adapter } from 'next-auth/adapters';

// Check for NEXTAUTH_SECRET first, as it's critical
if (!process.env.NEXTAUTH_SECRET) {
  console.error('CRITICAL ERROR: Missing NEXTAUTH_SECRET environment variable. Authentication will not work.');
  throw new Error('Missing NEXTAUTH_SECRET environment variable. Please define it in your .env file.');
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
  console.log("Google OAuth Provider configured.");
} else {
  console.warn("Google OAuth credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET) not found in .env. Google login will be disabled.");
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
  console.log("GitHub OAuth Provider configured.");
} else {
  console.warn("GitHub OAuth credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) not found in .env. GitHub login will be disabled.");
}

if (providers.length === 0) {
  console.error('CRITICAL ERROR: No OAuth providers configured. Please provide credentials for at least one provider (e.g., Google or GitHub) in your .env file.');
  throw new Error('No OAuth providers configured. Check .env file for GOOGLE_CLIENT_ID/SECRET or GITHUB_CLIENT_ID/SECRET.');
}

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt', // Using JWT for session strategy
  },
  callbacks: {
    async jwt({ token, account, user }) {
      // Persist the OAuth access_token and provider to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider; // e.g. "github" or "google"
      }
      // Persist the user ID to the token
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client, like an access_token and user id from a provider.
      if (token.accessToken) {
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    // signOut: '/auth/signout', // Optional: Custom sign out page
    // error: '/auth/error', // Optional: Custom error page
    // verifyRequest: '/auth/verify-request', // Optional: Custom verify request page
    // newUser: null // Optional: Redirect new users to a specific page
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
