
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
} else {
  console.warn("WARNING: GitHub OAuth credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) not found in .env. GitHub login will be disabled.");
}

if (providers.length === 0) {
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

      if (account && user) { // Initial sign-in or re-authentication that involves the account object
        token.accessToken = account.access_token;
        token.provider = account.provider;

        if (user?.id && typeof user.id === 'string' && mongoose.Types.ObjectId.isValid(user.id)) {
          token.id = user.id;
        } else {
          if (profile?.email) {
            const dbUserByEmail = await UserModel.findOne({ email: profile.email }).select('_id').lean();
            if (dbUserByEmail) {
              token.id = dbUserByEmail._id.toString();
            } else {
              delete token.id;
            }
          } else {
            delete token.id;
          }
        }
      }

      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role; 
          token.status = dbUser.status;
          token.email = dbUser.email;

          if (account && token.role !== 'admin') { 
            const userCount = await UserModel.countDocuments();
            if (userCount === 1) { 
              await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
              token.role = 'admin'; 
              token.status = 'active';
            }
          }
        } else {
          delete token.role;
          delete token.status;
          delete token.email;
        }
      } else if (token.id) { 
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
      if (token.email && session.user) {
        session.user.email = token.email as string;
      } else if (session.user && !token.email) {
        delete session.user.email;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      await connectMongoose();

      if (!account || !profile?.email) { 
        if (user?.id && mongoose.Types.ObjectId.isValid(user.id)) {
            const dbUser = await UserModel.findById(user.id).select('status email').lean();
            if (dbUser?.status === 'suspended') {
                return '/auth/signin?error=suspended';
            }
        }
        return true;
      }

      const userByEmail = await UserModel.findOne({ email: profile.email }).select('status _id').lean();
      if (userByEmail?.status === 'suspended') {
        return `/auth/signin?error=suspended&email=${encodeURIComponent(profile.email)}`;
      }

      const linkedOAuthAccount = await AccountModel.findOne({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      }).lean();

      if (linkedOAuthAccount && linkedOAuthAccount.userId) {
        if (mongoose.Types.ObjectId.isValid(linkedOAuthAccount.userId.toString())) {
            const linkedUser = await UserModel.findById(linkedOAuthAccount.userId.toString()).select('status email').lean();
            if (linkedUser?.status === 'suspended') {
              return `/auth/signin?error=suspended&provider=${account.provider}`;
            }
        }
      }
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
    