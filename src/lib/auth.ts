import NextAuth, { type NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter'; // Corrected import
import clientPromise from './mongodb';
import type { Adapter } from 'next-auth/adapters';

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  throw new Error('Missing GitHub OAuth environment variables');
}
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Missing NEXTAUTH_SECRET environment variable');
}

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'repo read:user user:email', // Request necessary scopes
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt', // Using JWT for session strategy
  },
  callbacks: {
    async jwt({ token, account, user }) {
      // Persist the OAuth access_token and provider to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider; // e.g. "github"
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

// The handler default export is not directly used by route.ts in app router,
// but defining it here is fine. Route handlers will call NextAuth(authOptions).
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
