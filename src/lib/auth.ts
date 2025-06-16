
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

const useSecureCookies = process.env.NEXTAUTH_URL!.startsWith("https:");

const getCookieName = (baseName: string) => {
  if (useSecureCookies) {
    if (baseName.includes('csrf-token') || baseName.includes('state') || baseName.includes('pkce')) { // Host- for CSRF/state/pkce
      return `__Host-${baseName}`;
    }
    return `__Secure-${baseName}`; // Secure- for others
  }
  return baseName; // Plain name for HTTP
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

      let existingUserInDB = await UserModel.findOne({ email: userEmail }).select('_id status role').lean();

      if (existingUserInDB) {
        const userStatus = existingUserInDB.status || 'active'; // Default to active if undefined
        const userRole = existingUserInDB.role || 'user';     // Default to user if undefined

        console.log(`[SignIn Callback] Existing user found in DB: ${existingUserInDB._id}, DB Status: ${existingUserInDB.status} (Effective: ${userStatus}), DB Role: ${existingUserInDB.role} (Effective: ${userRole})`);
        
        if (userStatus === 'suspended') {
          console.warn(`[SignIn Callback] Denied: Account for email '${userEmail}' is suspended.`);
          return `/auth/signin?error=AccountSuspended&email=${encodeURIComponent(userEmail)}`;
        }

        // If status or role were missing from DB, ensure they are set (should be rare with schema defaults if DB connection is good)
        if (!existingUserInDB.status || !existingUserInDB.role) {
            console.warn(`[SignIn Callback] Existing user ${existingUserInDB._id} missing status or role in DB. Preparing to update with defaults.`);
            const updatesToApply: any = {};
            if (!existingUserInDB.status) updatesToApply.status = 'active';
            if (!existingUserInDB.role) updatesToApply.role = 'user';
            try {
                await UserModel.findByIdAndUpdate(existingUserInDB._id, { $set: updatesToApply });
                console.log(`[SignIn Callback] Updated existing user ${existingUserInDB._id} with defaults in DB.`);
            } catch (dbUpdateError) {
                console.error(`[SignIn Callback] Error updating existing user ${existingUserInDB._id} with defaults:`, dbUpdateError);
            }
        }

      } else {
        console.log(`[SignIn Callback] New user with email '${userEmail}'. Adapter will create this user. Mongoose schema defaults for role ('user') and status ('active') should apply.`);
      }
      
      console.log(`[SignIn Callback] Approved sign-in for email: '${userEmail}'. Adapter will handle user creation/linking.`);
      return true;
    },

    async jwt({ token, user, account, profile, isNewUser }) {
      await connectMongoose();
      
      let dbUser;

      if (user?.id) { // This block handles initial sign-in or when linking a new provider. `user.id` is from the adapter.
        console.log(`[JWT Callback] Processing user ID from adapter/profile: ${user.id}. isNewUser by NextAuth: ${isNewUser}. Account provider: ${account?.provider}`);
        dbUser = await UserModel.findById(user.id).select('_id role email status name image').lean();

        if (!dbUser) {
          console.error(`[JWT Callback] CRITICAL: User ${user.id} (from adapter) NOT FOUND in DB immediately after creation/linking. Invalidating token.`);
          return {}; // Invalidate token
        }

        const updatesToApply: { role?: string; status?: string } = {};
        if (!dbUser.role) {
          updatesToApply.role = 'user';
          console.warn(`[JWT Callback] User ${dbUser._id} was missing 'role' in DB after adapter op. Setting to 'user'.`);
        }
        if (!dbUser.status) {
          updatesToApply.status = 'active';
          console.warn(`[JWT Callback] User ${dbUser._id} was missing 'status' in DB after adapter op. Setting to 'active'.`);
        }

        if (Object.keys(updatesToApply).length > 0) {
          try {
            const updatedUserInDB = await UserModel.findByIdAndUpdate(
              dbUser._id,
              { $set: updatesToApply },
              { new: true }
            ).select('_id role status email name image').lean();

            if (updatedUserInDB) {
              dbUser = updatedUserInDB;
              console.log(`[JWT Callback] User ${dbUser._id} DB record explicitly updated with defaults. Role: ${dbUser.role}, Status: ${dbUser.status}`);
            } else {
              console.error(`[JWT Callback] Failed to explicitly update user ${dbUser._id} with defaults in DB.`);
              // Proceed with dbUser as it was, defaults will be applied to token below.
            }
          } catch (updateError) {
            console.error(`[JWT Callback] Error explicitly updating user ${dbUser._id} with defaults:`, updateError);
          }
        }

        // Populate token from dbUser
        token.id = dbUser._id.toString();
        token.role = dbUser.role || 'user'; // Ensure role is set
        token.status = dbUser.status || 'active'; // Ensure status is set
        token.email = dbUser.email;
        token.name = dbUser.name || (profile as any)?.name || (profile as any)?.login || token.name;
        token.picture = dbUser.image || (profile as any)?.avatar_url || token.picture;
        if (account?.access_token) token.accessToken = account.access_token;

        console.log(`[JWT Callback] Token populated for user ${token.id}. Role: ${token.role}, Status: ${token.status}`);

        // First user admin promotion logic
        const totalUsers = await UserModel.countDocuments();
        console.log(`[JWT Callback] Total users in DB: ${totalUsers}. Role for user ${token.id} (from DB/defaults): ${token.role}`);
        if (totalUsers === 1 && token.role === 'user') { 
          console.log(`[JWT Callback] This is the first user (${token.id}) and their role is 'user'. Promoting to 'admin'.`);
          try {
            const promotedUser = await UserModel.findByIdAndUpdate(
              token.id,
              { $set: { role: 'admin', status: 'active' } }, // Ensure status is active too
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
        } else {
            console.log(`[JWT Callback] User ${token.id} (total users: ${totalUsers}, role: ${token.role}). No admin promotion needed or applicable.`);
        }
        return token;

      } else if (token.id && typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id)) {
        // Subsequent JWT calls (e.g., session refresh)
        console.log(`[JWT Callback - Subsequent] Refreshing token for user ID: ${token.id}`);
        dbUser = await UserModel.findById(token.id).select('_id role email status name image').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user'; 
          token.status = dbUser.status || 'active';
          token.email = dbUser.email;
          token.name = dbUser.name || token.name; 
          token.picture = dbUser.image || token.picture;
          console.log(`[JWT Callback - Subsequent] Token refreshed successfully for ${token.id}. Role: ${token.role}, Status: ${token.status}`);
        } else {
          console.warn(`[JWT Callback - Subsequent] User with ID ${token.id} not found in DB during refresh. Invalidating token.`);
          return {}; // Invalidate token by returning an empty object
        }
        return token;
      }
      
      console.warn(`[JWT Callback] Unhandled token processing path. Token (keys): ${Object.keys(token).join(', ')}, account: ${!!account}, user: ${!!user}`);
      return token; // Return existing token if no specific logic applied
    },

    async session({ session, token }) {
      if (!token || Object.keys(token).length === 0 || !token.id) {
        console.warn("[Session Callback] Token is empty, invalid, or missing ID. Clearing session user data.");
        session.user = {} as any; // Clear user object
        delete session.accessToken;
        return session;
      }
      
      if (token.accessToken) { 
        session.accessToken = token.accessToken as string;
      }
      
      if (!session.user) {
        session.user = {} as any; // Ensure user object exists
      }
      
      session.user.id = token.id as string;
      session.user.role = (token.role as 'user' | 'admin') || 'user'; // Default to 'user' if missing
      session.user.status = (token.status as 'active' | 'suspended') || 'active'; // Default to 'active' if missing

      // Ensure optional fields are correctly typed or undefined
      session.user.email = (token.email as string) || undefined;
      session.user.name = (token.name as string) || undefined;
      session.user.image = (token.picture as string) || undefined;
      
      console.log(`[Session Callback] Session populated for user ${session.user.id}. Role: ${session.user.role}, Status: ${session.user.status}`);
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
    
    
    
