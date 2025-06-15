
import NextAuth, { type NextAuthOptions, type AuthProvider, type Adapter } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise, { User as UserModel, connectMongoose, Account as AccountModel } from './mongodb';
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

const getCookiePrefix = () => {
  // For production on HTTPS, use __Host- for CSRF and __Secure- for others if possible
  // For development on HTTP, use no prefix or ensure secure flag is false.
  if (isProduction && useSecureCookies) return "__Host-"; // Most restrictive
  if (!isProduction && useSecureCookies) return "__Secure-"; // Unlikely (HTTPS in non-prod)
  return ""; // HTTP, no prefix
};

const cookiePrefix = getCookiePrefix();
const secureFlag = isProduction && useSecureCookies; // Secure flag true only for production HTTPS

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: `${secureFlag ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureFlag,
      },
    },
    callbackUrl: {
      name: `${secureFlag ? '__Secure-' : ''}next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: secureFlag,
      },
    },
    csrfToken: {
      name: `${cookiePrefix}next-auth.csrf-token`, // __Host- if prod+https
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureFlag,
      },
    },
    pkceCodeVerifier: {
      name: `${secureFlag ? '__Secure-' : ''}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureFlag,
        maxAge: 60 * 15, // 15 minutes
      },
    },
    state: {
      name: `${secureFlag ? '__Secure-' : ''}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureFlag,
        maxAge: 60 * 15, // 15 minutes
      },
    },
    nonce: {
      name: `${secureFlag ? '__Secure-' : ''}next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureFlag,
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
      console.log(`[SignIn Callback] Attempting sign-in for email: '${userEmail}', Provider: '${account?.provider}', isNewUser flag from NextAuth: ${isNewUser}`);

      const existingUserInDB = await UserModel.findOne({ email: userEmail }).select('_id status role').lean();

      if (existingUserInDB) {
        const userStatus = existingUserInDB.status || 'active'; 
        const userRole = existingUserInDB.role || 'user'; 
        console.log(`[SignIn Callback] Existing user found in DB: ${existingUserInDB._id}, Status: ${userStatus}, Role: ${userRole}`);
        if (userStatus === 'suspended') {
          console.warn(`[SignIn Callback] Denied: Account for email '${userEmail}' is suspended.`);
          return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(userEmail)}`;
        }
      } else {
        console.log(`[SignIn Callback] New user with email '${userEmail}'. Adapter will create this user. Mongoose schema defaults for role ('user') and status ('active') should apply.`);
      }
      
      console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle user creation/linking.`);
      return true;
    },

    async jwt({ token, user, account, profile, isNewUser }) {
      await connectMongoose();

      // This block handles the very first time a user signs in (new or existing) and the JWT is being created.
      // `user` and `account` are present.
      if (user && user.id && account) {
        console.log(`[JWT Callback] Initial JWT creation for user: ${user.id} (isNewUser: ${isNewUser})`);
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        
        if (!dbUser) {
          console.error(`[JWT Callback - Initial] CRITICAL: User ${user.id} (from adapter) not found in DB. Invalidating token.`);
          return {}; // Invalidate token
        }

        // Populate token with data from the DB user
        token.id = dbUser._id.toString();
        token.role = dbUser.role || 'user'; // Default to 'user' if somehow missing
        token.status = dbUser.status || 'active'; // Default to 'active' if somehow missing
        token.email = dbUser.email;
        token.name = dbUser.name || (profile as any)?.login; 
        token.picture = dbUser.image || (profile as any)?.avatar_url;
        if (account.access_token) token.accessToken = account.access_token;

        // Explicitly check if this `isNewUser` (as per NextAuth) is the *very first* user.
        if (isNewUser) {
          console.log(`[JWT Callback - New User] User ${token.id} identified as new by NextAuth.`);
          const totalUsers = await UserModel.countDocuments();
          console.log(`[JWT Callback - New User] Total users in DB: ${totalUsers}. Current role from DB for new user ${token.id}: ${dbUser.role}`);
          
          // Only promote if they are the absolute first user AND their role from DB is 'user' (confirming default was applied)
          if (totalUsers === 1 && dbUser.role === 'user') {
            console.log(`[JWT Callback - New User] This is the first user. Promoting to 'admin'.`);
            try {
              const updatedFirstUser = await UserModel.findByIdAndUpdate(
                dbUser._id,
                { $set: { role: 'admin', status: 'active' } }, // Ensure status is active too
                { new: true }
              ).select('role status').lean(); 

              if (updatedFirstUser) {
                token.role = updatedFirstUser.role; // Should be 'admin'
                token.status = updatedFirstUser.status; // Should be 'active'
                console.log(`[JWT Callback - First User Admin Promotion] User ${token.id} promoted. Token updated. Role: ${token.role}, Status: ${token.status}`);
              } else {
                console.error(`[JWT Callback - First User Admin Promotion] Failed to update first user ${dbUser._id} to admin in DB. Token role remains '${token.role}'.`);
              }
            } catch (err) {
              console.error(`[JWT Callback - First User Admin Promotion] Error promoting user ${dbUser._id} to admin:`, err);
              // Token role remains as initially set from dbUser ('user')
            }
          } else if (totalUsers > 1 && dbUser.role !== 'user') {
             console.warn(`[JWT Callback - New User] New user ${token.id} (total: ${totalUsers}) has unexpected role '${dbUser.role}' from DB. Expected 'user'. Check adapter/schema defaults or manual DB changes.`);
             token.role = 'user'; // Force to 'user' in token if not first and role is not user.
          } else {
            console.log(`[JWT Callback - New User] New user ${token.id} (total: ${totalUsers}) correctly has role '${token.role}' (from DB default). No admin promotion needed.`);
          }
        } else if (!isNewUser) {
           console.log(`[JWT Callback - Existing User Sign-in] User ${token.id} processed. Role from DB: ${dbUser.role}, Status from DB: ${dbUser.status}`);
        }
        return token;
      }

      // This block handles subsequent JWT calls (e.g., session refresh) where only `token` is present.
      // `user` and `account` are not present here.
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        // console.log(`[JWT Callback] Subsequent JWT verification/refresh for user: ${token.id}.`);
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email; // Keep email, name, picture in sync
          token.name = dbUser.name;
          token.picture = dbUser.image;
          // accessToken is typically not refreshed here by default.
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB during refresh. Invalidating token.`);
          return {}; // Invalidate token
        }
        return token;
      }
      
      console.warn(`[JWT Callback] Unhandled token processing path. Token:`, JSON.stringify(token).substring(0,200), `isNewUser: ${isNewUser}`);
      return token; // Default return if no other path matches
    },

    async session({ session, token }) {
      if (!token || Object.keys(token).length === 0 || !token.id) {
        console.warn("[Session Callback] Token is empty, invalid, or missing ID. Clearing session user data.");
        if(session.user) {
          session.user = {} as any; 
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
    
