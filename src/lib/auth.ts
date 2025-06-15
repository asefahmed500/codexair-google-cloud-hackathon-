
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

const useSecureCookies = process.env.NEXTAUTH_URL!.startsWith("https:");

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt',
  },
  cookies: {
    state: {
      name: `next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    // You can define other cookies (sessionToken, callbackUrl, csrfToken) here if needed
    // For example, for CSRF token to ensure it's also lax:
    csrfToken: {
      name: `next-auth.csrf-token`, // or `__Host-next-auth.csrf-token` if using __Host- prefix
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    // Ensure callback URL cookies are also handled correctly
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      await connectMongoose();
      const userEmail = user?.email || (profile as any)?.email; 

      if (!userEmail) {
        console.error("[SignIn Callback] Critical: Missing email from OAuth profile.", { user, profile });
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
        console.log(`[SignIn Callback] User with email '${userEmail}' not found in DB. Adapter will create this user.`);
      }
      
      console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle user creation/linking.`);
      return true;
    },

    async jwt({ token, user, account }) {
      await connectMongoose();

      if (account && user && user.id) {
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.id = dbUser._id.toString();
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image; 
          if (account.access_token) token.accessToken = account.access_token;
          console.log(`[JWT Callback - Initial Sign-in] User ${token.id} processed. Token updated with DB data. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.error(`[JWT Callback - Initial Sign-in] CRITICAL: User with id ${user.id} (from adapter) not found in DB.`);
          token = {}; 
        }
      } else if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; 
          token.status = dbUser.status || 'active'; 
          token.email = dbUser.email; 
          token.name = dbUser.name; 
          token.picture = dbUser.image; 
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB. Clearing sensitive fields from token.`);
          delete token.role;
          delete token.status;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.accessToken) { 
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      
      if (token.role && session.user) {
        session.user.role = token.role as 'user' | 'admin';
      } else if (session.user) {
        session.user.role = 'user'; 
      }
      
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      } else if (session.user) {
        session.user.status = 'active'; 
      }

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
    
    
