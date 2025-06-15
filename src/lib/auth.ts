
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
  if (isProduction && useSecureCookies) return "__Host-";
  if (useSecureCookies) return "__Secure-";
  return "";
};
const cookiePrefix = getCookiePrefix();


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
      name: `${isProduction && useSecureCookies ? '__Host-' : ''}next-auth.csrf-token`, // CSRF specific recommendation
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
        console.log(`[SignIn Callback] New user with email '${userEmail}'. Adapter will create this user. Mongoose schema defaults for role ('user') and status ('active') should apply.`);
      }
      
      console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle user creation/linking.`);
      return true;
    },

    async jwt({ token, user, account, profile, isNewUser }) {
      await connectMongoose();

      if (isNewUser && user?.id) { // Handle new user creation definitively here
        console.log(`[JWT Callback] Processing new user: ${user.id}.`);
        // The adapter has already created the user in the DB.
        // Mongoose schema defaults (role: 'user', status: 'active') should have been applied.
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        
        if (!dbUser) {
          console.error(`[JWT Callback - New User] CRITICAL: Newly created user ${user.id} not found in DB immediately. This should not happen if adapter ran successfully.`);
          return {}; // Invalidate token
        }

        // Populate token with data from the newly created DB user (which includes schema defaults)
        token.id = dbUser._id.toString();
        token.role = dbUser.role; // This should be 'user' by default from schema
        token.status = dbUser.status; // This should be 'active' by default from schema
        token.email = dbUser.email;
        token.name = dbUser.name || (profile as any)?.login; 
        token.picture = dbUser.image || (profile as any)?.avatar_url;

        // Now, check if this new user is the *very first* user overall
        const totalUsers = await UserModel.countDocuments();
        if (totalUsers === 1 && token.role === 'user') { // Only promote if they are currently 'user' and are the only one
          console.log(`[JWT Callback] First user detected (${user.id}). Current role from DB: ${dbUser.role}. Promoting to 'admin'.`);
          try {
            const updatedUser = await UserModel.findByIdAndUpdate(
              user.id,
              { $set: { role: 'admin', status: 'active' } }, // Ensure status is active too
              { new: true }
            ).select('role status').lean(); 

            if (updatedUser) {
              token.role = updatedUser.role; // Should be 'admin'
              token.status = updatedUser.status; // Should be 'active'
              console.log(`[JWT Callback - First User Admin Promotion] User ${token.id} promoted. Token updated. Role: ${token.role}, Status: ${token.status}`);
            } else {
              console.error(`[JWT Callback - First User Admin Promotion] Failed to update first user ${user.id} to admin in DB.`);
              // Token role remains 'user' (from the earlier dbUser read), which is safer in case of DB error
            }
          } catch (err) {
            console.error(`[JWT Callback - First User Admin Promotion] Error promoting user ${user.id} to admin:`, err);
            // Token role remains 'user'
          }
        } else {
          console.log(`[JWT Callback - New User (Not First)] User ${token.id}. Role from DB: ${dbUser.role}, Status from DB: ${dbUser.status}. Total users: ${totalUsers}.`);
        }

        if (account?.access_token) token.accessToken = account.access_token;
        return token; // New user processing is complete
      }

      // Handle existing user sign-in (token is being created for the first time in this session for an existing user)
      if (user?.id && account && !isNewUser) { 
        console.log(`[JWT Callback] Existing user sign-in: ${user.id}.`);
        const dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.id = dbUser._id.toString();
          token.role = dbUser.role || 'user'; // Default if somehow missing
          token.status = dbUser.status || 'active'; // Default if somehow missing
          token.email = dbUser.email;
          token.name = dbUser.name || (profile as any)?.login;
          token.picture = dbUser.image || (profile as any)?.avatar_url;
          if (account.access_token) token.accessToken = account.access_token;
          console.log(`[JWT Callback - Existing User Sign-in] User ${token.id} processed. Token updated. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.error(`[JWT Callback - Existing User Sign-in] CRITICAL: User ${user.id} (from OAuth) not found in DB.`);
          return {}; // Invalidate token
        }
        return token;
      }
      
      // Handle token refresh (user and account are not present, but token.id is from previous session)
      if (!user && !account && token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        // This is a token refresh, not an initial sign-in for this session.
        // isNewUser will be false here.
        // console.log(`[JWT Callback] Token refresh for user: ${token.id}.`);
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image;
          // accessToken is typically not refreshed here unless specific provider logic is implemented
        } else {
          console.warn(`[JWT Callback - Token Refresh] User with ID ${token.id} not found in DB. Invalidating token.`);
          return {}; // Invalidate token
        }
        return token;
      }
      
      console.warn(`[JWT Callback] Unhandled token processing path. Token:`, JSON.stringify(token), `User:`, JSON.stringify(user), `Account:`, JSON.stringify(account), `isNewUser: ${isNewUser}`);
      return token; // Default return
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
    
