
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
  // For production and HTTPS, use __Host- for CSRF and __Secure- for others if appropriate
  // For local HTTP, use the base name.
  if (isProduction && useSecureCookies) {
    if (baseName === 'next-auth.csrf-token') return `__Host-${baseName}`;
    // For other cookies like session-token, callback-url, state, pkce, nonce, __Secure- is appropriate.
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
        console.log(`[SignIn Callback] Existing user found in DB: ${existingUserInDB._id}, DB Status: ${existingUserInDB.status} (Effective: ${userStatus}), DB Role: ${existingUserInDB.role} (Effective: ${userRole})`);
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

      if (account && user && user.id) { // This branch is typically for initial sign-in
        console.log(`[JWT Callback] Initial JWT creation for user: ${user.id} (isNewUser by NextAuth: ${isNewUser})`); // Log isNewUser from NextAuth
        
        let dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();

        if (!dbUser) {
          console.error(`[JWT Callback - New User Path] CRITICAL: User ${user.id} (from adapter) NOT FOUND in DB immediately after creation. Invalidating token.`);
          return {}; // Invalidate token
        }
        
        // Ensure role and status are explicitly set in the DB for new users if schema defaults didn't catch it.
        // This also covers the case where isNewUser flag from NextAuth might be false but dbUser.role/status are missing.
        const updatesToApply: { role?: string; status?: string } = {};
        if (!dbUser.role) {
          updatesToApply.role = 'user';
          console.warn(`[JWT Callback] User ${dbUser._id} was missing 'role' in DB. Preparing to set to 'user'.`);
        }
        if (!dbUser.status) {
          updatesToApply.status = 'active';
          console.warn(`[JWT Callback] User ${dbUser._id} was missing 'status' in DB. Preparing to set to 'active'.`);
        }

        if (Object.keys(updatesToApply).length > 0) {
          try {
            const updatedUserInDB = await UserModel.findByIdAndUpdate(
              dbUser._id,
              { $set: updatesToApply },
              { new: true }
            ).select('_id role status email name image').lean();

            if (updatedUserInDB) {
              dbUser = updatedUserInDB; // Use the updated user for subsequent logic
              console.log(`[JWT Callback] User ${dbUser._id} DB record explicitly updated with defaults. Role: ${dbUser.role}, Status: ${dbUser.status}`);
            } else {
              console.error(`[JWT Callback] Failed to explicitly update user ${dbUser._id} with defaults in DB.`);
            }
          } catch (updateError) {
            console.error(`[JWT Callback] Error explicitly updating user ${dbUser._id} with defaults:`, updateError);
          }
        }
        
        token.id = dbUser._id.toString();
        token.role = dbUser.role || 'user'; 
        token.status = dbUser.status || 'active'; 
        token.email = dbUser.email;
        token.name = dbUser.name || (profile as any)?.name || (profile as any)?.login;
        token.picture = dbUser.image || (profile as any)?.avatar_url;
        if (account.access_token) token.accessToken = account.access_token;

        // First user admin promotion logic (only if truly new OR if their role is still 'user')
        // This check is now more robust as dbUser.role should be reliably 'user' from the above update.
        const totalUsers = await UserModel.countDocuments();
        console.log(`[JWT Callback] Total users in DB: ${totalUsers}. Role for user ${token.id} (after DB updates): ${dbUser.role}`);
        if (totalUsers === 1 && dbUser.role === 'user') { 
          console.log(`[JWT Callback] This is the first user (${token.id}) and their role is 'user'. Promoting to 'admin'.`);
          try {
            const promotedUser = await UserModel.findByIdAndUpdate(
              token.id,
              { $set: { role: 'admin', status: 'active' } },
              { new: true }
            ).select('_id role status').lean();

            if (promotedUser) {
              token.role = promotedUser.role; 
              token.status = promotedUser.status;
              console.log(`[JWT Callback - First User Admin Promotion] User ${token.id} promoted. Token updated. Role: ${token.role}, Status: ${token.status}`);
            } else {
              console.error(`[JWT Callback - First User Admin Promotion] Failed to update first user ${token.id} to admin in DB. Token role remains '${token.role}'.`);
            }
          } catch (err) {
            console.error(`[JWT Callback - First User Admin Promotion] Error promoting user ${token.id} to admin:`, err);
          }
        } else if (totalUsers > 1 && dbUser.role === 'admin') {
            console.warn(`[JWT Callback] User ${token.id} has role 'admin' but is not the first user (total: ${totalUsers}). This might be unexpected. No change to role.`);
        } else {
            console.log(`[JWT Callback] User ${token.id} (total users: ${totalUsers}, role: ${dbUser.role}). No admin promotion needed or applicable.`);
        }
        return token;
      }

      // Subsequent JWT calls (e.g., session refresh)
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        const dbUserFromRefresh = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUserFromRefresh) {
          token.role = dbUserFromRefresh.role || 'user'; 
          token.status = dbUserFromRefresh.status || 'active';
          token.email = dbUserFromRefresh.email;
          token.name = dbUserFromRefresh.name || token.name; 
          token.picture = dbUserFromRefresh.image || token.picture;
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB during refresh. Invalidating token.`);
          return {}; 
        }
        return token;
      }
      
      console.warn(`[JWT Callback] Unhandled token processing path. Token (keys): ${Object.keys(token).join(', ')}, account: ${!!account}, user: ${!!user}`);
      return token;
    },

    async session({ session, token }) {
      if (!token || Object.keys(token).length === 0 || !token.id) {
        console.warn("[Session Callback] Token is empty, invalid, or missing ID. Clearing session user data.");
        if(session.user) { 
          session.user = {} as any; // Clear user object
        }
        // Potentially remove accessToken as well if token is completely invalid
        delete session.accessToken;
        return session;
      }
      
      if (token.accessToken) { 
        session.accessToken = token.accessToken as string;
      }
      
      if (!session.user) {
        session.user = {} as any;
      }
      
      session.user.id = token.id as string;
      session.user.role = (token.role as 'user' | 'admin') || 'user';
      session.user.status = (token.status as 'active' | 'suspended') || 'active';

      if (token.email) session.user.email = token.email as string;
      if (token.name) session.user.name as string;
      if (token.picture) session.user.image as string;
      
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
    