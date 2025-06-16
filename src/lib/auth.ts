
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

const getCookieName = (baseName: string) => {
  if (isProduction && useSecureCookies) {
    if (baseName === 'next-auth.csrf-token') return `__Host-${baseName}`;
    return `__Secure-${baseName}`;
  }
  return baseName;
};


export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: getCookieName('next-auth.session-token'),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: getCookieName('next-auth.callback-url'),
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: getCookieName('next-auth.csrf-token'),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    pkceCodeVerifier: {
      name: getCookieName('next-auth.pkce.code_verifier'),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes
      },
    },
    state: {
      name: getCookieName('next-auth.state'),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes
      },
    },
    nonce: {
      name: getCookieName('next-auth.nonce'),
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

      if (account && user && user.id && isNewUser) { // This block is specifically for new user creation + first token
        console.log(`[JWT Callback - New User Initial] Processing for new user ID from adapter: ${user.id}`);
        
        // The adapter has created the user. Fetch it to ensure defaults are applied/readable and to perform updates if necessary.
        let dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();

        if (!dbUser) {
            console.error(`[JWT Callback - New User Initial] CRITICAL: User ${user.id} (from adapter) NOT FOUND in DB immediately after creation. This should not happen. Invalidating token.`);
            return {}; // Invalidate token
        }
        console.log(`[JWT Callback - New User Initial] Fetched new user from DB: ${dbUser._id}, Current DB Role: ${dbUser.role}, Current DB Status: ${dbUser.status}`);

        const updatesToApply: { role?: string; status?: string } = {};
        if (!dbUser.role) {
            updatesToApply.role = 'user';
            console.warn(`[JWT Callback - New User Initial] User ${dbUser._id} was missing 'role' in DB (schema default failed or not yet applied). Setting to 'user'.`);
        }
        if (!dbUser.status) {
            updatesToApply.status = 'active';
            console.warn(`[JWT Callback - New User Initial] User ${dbUser._id} was missing 'status' in DB (schema default failed or not yet applied). Setting to 'active'.`);
        }

        if (Object.keys(updatesToApply).length > 0) {
            try {
                const updatedDbUserAfterDefaults = await UserModel.findByIdAndUpdate(
                    dbUser._id,
                    { $set: updatesToApply },
                    { new: true }
                ).select('_id role email status name image').lean();
                
                if (updatedDbUserAfterDefaults) {
                    dbUser = updatedDbUserAfterDefaults; // Use the definitively updated user record
                    console.log(`[JWT Callback - New User Initial] User ${dbUser._id} DB record explicitly updated with defaults. Role: ${dbUser.role}, Status: ${dbUser.status}`);
                } else {
                    console.error(`[JWT Callback - New User Initial] Failed to apply explicit defaults for user ${dbUser._id} in DB. Proceeding with potentially incomplete DB data for token.`);
                }
            } catch (updateError) {
                console.error(`[JWT Callback - New User Initial] Error explicitly updating user ${dbUser._id} with defaults:`, updateError);
            }
        }

        // Populate token with data from the DB user (which now should have role/status)
        token.id = dbUser._id.toString();
        token.role = dbUser.role || 'user'; // Fallback just in case, though dbUser.role should be set
        token.status = dbUser.status || 'active'; // Fallback just in case
        token.email = dbUser.email;
        token.name = dbUser.name || (profile as any)?.name || (profile as any)?.login;
        token.picture = dbUser.image || (profile as any)?.avatar_url;
        if (account.access_token) token.accessToken = account.access_token;

        // First user admin promotion logic
        const totalUsers = await UserModel.countDocuments();
        console.log(`[JWT Callback - New User Initial] Total users in DB: ${totalUsers}. Current new user role (from token): ${token.role}`);
        if (totalUsers === 1 && token.role === 'user') { // Check if it's the first user AND their role is 'user'
          console.log(`[JWT Callback - New User Initial] This is the first user (${token.id}). Promoting to 'admin'.`);
          try {
            const promotedUser = await UserModel.findByIdAndUpdate(
              token.id,
              { $set: { role: 'admin', status: 'active' } }, // Ensure status is active
              { new: true }
            ).select('_id role status').lean();

            if (promotedUser) {
              token.role = promotedUser.role; // Should be 'admin'
              token.status = promotedUser.status; // Should be 'active'
              console.log(`[JWT Callback - First User Admin Promotion] User ${token.id} promoted. Token updated. Role: ${token.role}, Status: ${token.status}`);
            } else {
              console.error(`[JWT Callback - First User Admin Promotion] Failed to update first user ${token.id} to admin in DB. Token role remains '${token.role}'.`);
            }
          } catch (err) {
            console.error(`[JWT Callback - First User Admin Promotion] Error promoting user ${token.id} to admin:`, err);
          }
        } else if (totalUsers > 1 && token.role !== 'user') {
             console.warn(`[JWT Callback - New User Initial] New user ${token.id} (total: ${totalUsers}) has unexpected role '${token.role}' after default application. Check adapter/schema defaults or manual DB changes. Forcing to 'user' in token if not first admin.`);
             if (token.role === 'admin' && totalUsers > 1) token.role = 'user'; // Safety: Ensure subsequent new users are not admins
        } else {
            console.log(`[JWT Callback - New User Initial] New user ${token.id} (total: ${totalUsers}) correctly has role '${token.role}'. No admin promotion needed or applicable.`);
        }
        return token;
      }

      // This block handles subsequent JWT calls (e.g., session refresh, or if `isNewUser` was false/undefined)
      // OR if it's an existing user initial sign-in (where `account` and `user` are present but `isNewUser` is false)
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        // console.log(`[JWT Callback] Subsequent JWT verification/refresh for user: ${token.id}. Or existing user sign-in.`);
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; // Default if missing
          token.status = dbUser.status || 'active'; // Default if missing
          token.email = dbUser.email;
          token.name = dbUser.name || token.name; // Preserve token name if DB name is null
          token.picture = dbUser.image || token.picture; // Preserve token image if DB image is null
          if (account?.access_token && !token.accessToken) token.accessToken = account.access_token; // Refresh access token if account present
        } else {
          console.warn(`[JWT Callback - Subsequent/Existing] User with ID ${token.id} not found in DB during refresh/lookup. Invalidating token.`);
          return {}; // Invalidate token
        }
        return token;
      }
      
      console.warn(`[JWT Callback] Unhandled token processing path. Token:`, JSON.stringify(token).substring(0,200), `isNewUser: ${isNewUser}, account: ${!!account}, user: ${!!user}`);
      return token; // Default return if no other path matches
    },

    async session({ session, token }) {
      if (!token || Object.keys(token).length === 0 || !token.id) {
        console.warn("[Session Callback] Token is empty, invalid, or missing ID. Clearing session user data.");
        if(session.user) { // Ensure session.user exists before trying to modify it
          session.user = {} as any; // Or set specific fields to null/undefined
        }
        return session;
      }
      
      if (token.accessToken) { 
        session.accessToken = token.accessToken as string;
      }
      // Initialize session.user if it's not already there
      if (!session.user) {
        session.user = {} as any;
      }
      
      session.user.id = token.id as string;
      session.user.role = (token.role as 'user' | 'admin') || 'user';
      session.user.status = (token.status as 'active' | 'suspended') || 'active';

      if (token.email) {
        session.user.email = token.email as string;
      }
      if (token.name) {
        session.user.name = token.name as string;
      }
      if (token.picture) { 
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
    
