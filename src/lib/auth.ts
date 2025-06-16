
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
    if (baseName === 'next-auth.csrf-token') return `__Host-${baseName}`; // CSRF recommended with Host-
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
    nonce: { // Only used if you are using OpenID Connect with nonce check
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
        const userStatus = existingUserInDB.status || 'active'; // Default to 'active' if undefined for check
        const userRole = existingUserInDB.role || 'user'; // Default to 'user' if undefined for check
        console.log(`[SignIn Callback] Existing user found in DB: ${existingUserInDB._id}, DB Status: ${existingUserInDB.status}, DB Role: ${existingUserInDB.role}. Effective Status for check: ${userStatus}`);
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

      if (account && user && user.id) { // This branch is typically for initial sign-in (new or existing user)
        console.log(`[JWT Callback] Initial JWT creation for user: ${user.id} (isNewUser: ${isNewUser})`);
        let dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();

        if (!dbUser) {
          console.error(`[JWT Callback] CRITICAL: User ${user.id} (from adapter) NOT FOUND in DB. This should not happen during initial sign-in if adapter worked. Invalidating token.`);
          return {}; // Invalidate token
        }
        
        console.log(`[JWT Callback] User ${dbUser._id} fetched from DB. DB Role: ${dbUser.role}, DB Status: ${dbUser.status}`);

        // Populate token with data from the DB user
        token.id = dbUser._id.toString();
        token.role = dbUser.role || 'user'; // Default to 'user' if missing in DB
        token.status = dbUser.status || 'active'; // Default to 'active' if missing in DB
        token.email = dbUser.email;
        token.name = dbUser.name || (profile as any)?.name || (profile as any)?.login;
        token.picture = dbUser.image || (profile as any)?.avatar_url;
        if (account.access_token) token.accessToken = account.access_token;

        if (isNewUser) {
          console.log(`[JWT Callback - New User] User ${token.id} identified as new by NextAuth.`);
          // Check if any updates are needed because Mongoose defaults might not have been applied or read immediately
          const updatesToApply: { role?: string; status?: string } = {};
          if (!dbUser.role) {
            updatesToApply.role = 'user';
            console.warn(`[JWT Callback - New User] User ${token.id} was missing 'role' in DB initially. Forcing 'user'.`);
          }
          if (!dbUser.status) {
            updatesToApply.status = 'active';
            console.warn(`[JWT Callback - New User] User ${token.id} was missing 'status' in DB initially. Forcing 'active'.`);
          }

          if (Object.keys(updatesToApply).length > 0) {
            try {
                const updatedUserAfterExplicitDefaults = await UserModel.findByIdAndUpdate(
                    token.id,
                    { $set: updatesToApply },
                    { new: true }
                ).select('_id role status').lean();
                
                if (updatedUserAfterExplicitDefaults) {
                    token.role = updatedUserAfterExplicitDefaults.role;
                    token.status = updatedUserAfterExplicitDefaults.status;
                    console.log(`[JWT Callback - New User] User ${token.id} DB record explicitly updated with defaults. Role: ${token.role}, Status: ${token.status}`);
                } else {
                    console.error(`[JWT Callback - New User] Failed to apply explicit defaults for user ${token.id}. Token role/status might be based on prior DB state or initial token population.`);
                }
            } catch (updateError) {
                console.error(`[JWT Callback - New User] Error explicitly updating user ${token.id} with defaults:`, updateError);
            }
          }
          
          // First user admin promotion logic
          const totalUsers = await UserModel.countDocuments();
          console.log(`[JWT Callback - New User] Total users in DB: ${totalUsers}. Current role from token for new user ${token.id}: ${token.role}`);
          if (totalUsers === 1 && token.role === 'user') { 
            console.log(`[JWT Callback - New User] This is the first user (${token.id}). Promoting to 'admin'.`);
            try {
              const promotedUser = await UserModel.findByIdAndUpdate(
                token.id,
                { $set: { role: 'admin', status: 'active' } }, // Ensure status is active
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
          } else if (totalUsers > 1 && token.role !== 'user') {
             console.warn(`[JWT Callback - New User] New user ${token.id} (total: ${totalUsers}) has role '${token.role}' which is not 'user'. This might be unexpected if not the first user. Check logic.`);
             // Safety: If somehow a subsequent new user got 'admin', revert to 'user'
             if (token.role === 'admin' && totalUsers > 1) {
                console.warn(`[JWT Callback - New User] Reverting role of new user ${token.id} to 'user' as they are not the first user.`);
                token.role = 'user'; 
                // Optionally, update DB here too, but token is primary for session.
             }
          } else {
              console.log(`[JWT Callback - New User] New user ${token.id} (total: ${totalUsers}) correctly has role '${token.role}'. No admin promotion needed or applicable.`);
          }
        }
        return token;
      }

      // Subsequent JWT calls (e.g., session refresh)
      if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        // console.log(`[JWT Callback - Subsequent] Verifying/refreshing token for user: ${token.id}`);
        const dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; 
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name || token.name; 
          token.picture = dbUser.image || token.picture;
          // Do not re-assign accessToken here unless `account` is present (which it typically isn't on refreshes)
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB during refresh. Invalidating token.`);
          return {}; // Invalidate token
        }
        return token;
      }
      
      console.warn(`[JWT Callback] Unhandled token processing path. Token (keys): ${Object.keys(token).join(', ')}, isNewUser: ${isNewUser}, account: ${!!account}, user: ${!!user}`);
      return token;
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
      
      if (!session.user) {
        session.user = {} as any;
      }
      
      session.user.id = token.id as string;
      session.user.role = (token.role as 'user' | 'admin') || 'user';
      session.user.status = (token.status as 'active' | 'suspended') || 'active';

      if (token.email) session.user.email = token.email as string;
      if (token.name) session.user.name = token.name as string;
      if (token.picture) session.user.image = token.picture as string;
      
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
    
