
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

const isProduction = process.env.NODE_ENV === 'production';
const useSecureCookies = process.env.NEXTAUTH_URL!.startsWith("https:");

const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `${isProduction && useSecureCookies ? '__Host-' : ''}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes
      },
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes
      },
    },
    nonce: {
      name: `${cookiePrefix}next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile, isNewUser }) {
      await connectMongoose();
      const userEmail = user?.email || (profile as any)?.email;

      if (!userEmail) {
        console.error("[SignIn Callback] Critical: Missing email from OAuth profile.", { user, profile });
        return `/auth/signin?error=EmailMissing`;
      }
      console.log(`[SignIn Callback] Attempting sign-in for email: '${userEmail}', Provider: '${account?.provider}', isNewUser: ${isNewUser}`);

      const existingUserInDB = await UserModel.findOne({ email: userEmail }).select('_id status role').lean();

      if (existingUserInDB) {
        const userStatus = existingUserInDB.status || 'active'; // Default to active if status somehow undefined
        const userRole = existingUserInDB.role || 'user'; // Default to user if role somehow undefined
        console.log(`[SignIn Callback] Existing user found in DB: ${existingUserInDB._id}, Status: ${userStatus}, Role: ${userRole}`);
        if (userStatus === 'suspended') {
          console.warn(`[SignIn Callback] Denied: Account for email '${userEmail}' is suspended.`);
          return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(userEmail)}`;
        }
      } else {
        console.log(`[SignIn Callback] New user with email '${userEmail}'. Adapter will create this user. Mongoose schema defaults for role ('user') and status ('active') will apply.`);
      }
      
      console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle user creation/linking.`);
      return true;
    },

    async jwt({ token, user, account, isNewUser }) {
      await connectMongoose();

      if (isNewUser && user && user.id) {
        console.log(`[JWT Callback] New user processing: ${user.id}`);
        const totalUsers = await UserModel.countDocuments();
        if (totalUsers === 1) {
          console.log(`[JWT Callback] First user detected (${user.id}). Promoting to admin.`);
          try {
            const updatedUser = await UserModel.findByIdAndUpdate(
              user.id,
              { $set: { role: 'admin', status: 'active' } },
              { new: true }
            ).select('_id role email status name image').lean();

            if (updatedUser) {
              token.id = updatedUser._id.toString();
              token.role = updatedUser.role;
              token.status = updatedUser.status;
              token.email = updatedUser.email;
              token.name = updatedUser.name;
              token.picture = updatedUser.image;
              if (account?.access_token) token.accessToken = account.access_token;
              console.log(`[JWT Callback - First User Admin Promotion] User ${token.id} promoted. Token updated. Role: ${token.role}, Status: ${token.status}`);
              return token;
            } else {
              console.error(`[JWT Callback - First User Admin Promotion] Failed to update first user ${user.id} to admin.`);
            }
          } catch (err) {
            console.error(`[JWT Callback - First User Admin Promotion] Error promoting user ${user.id} to admin:`, err);
          }
        }
      }


      if (account && user && user.id) { // This block handles initial sign-in AFTER the new user check above
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.id = dbUser._id.toString();
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image; 
          if (account.access_token) token.accessToken = account.access_token;
          console.log(`[JWT Callback - Initial Sign-in (Non-First User)] User ${token.id} processed. Token updated with DB data. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.error(`[JWT Callback - Initial Sign-in] CRITICAL: User with id ${user.id} (from adapter) not found in DB.`);
          return {}; // Invalidate token
        }
      } else if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) { // Subsequent JWT calls for existing session
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; 
          token.status = dbUser.status || 'active'; 
          token.email = dbUser.email; 
          token.name = dbUser.name; 
          token.picture = dbUser.image; 
          // console.log(`[JWT Callback - Subsequent] Token for user ${token.id} refreshed. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB. Invalidating token.`);
          return {}; // Invalidate token
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (!token || Object.keys(token).length === 0) {
        console.warn("[Session Callback] Token is empty or invalid. Clearing session user data.");
        if(session.user) {
          session.user = {} as any; // Clear user data from session if token is invalid
        }
        return session;
      }
      
      if (token.accessToken) { 
        session.accessToken = token.accessToken as string;
      }
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      
      session.user.role = (token.role as 'user' | 'admin') || 'user';
      session.user.status = (token.status as 'active' | 'suspended') || 'active';

      if (token.email && session.user) {
        session.user.email = token.email as string;
      }
      if (token.name && session.user) {
        session.user.name = token.name as string;
      }
      if (token.picture && session.user) { 
        session.user.image = token.picture as string;
      }
      // console.log(`[Session Callback] Session created/updated for user ${session.user.id}. Role: ${session.user.role}, Status: ${session.user.status}`);
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

    