
import NextAuth, { type NextAuthOptions, type AuthProvider } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from './mongodb'; // Ensures MONGODB_URI is checked by mongodb.ts
import type { Adapter } from 'next-auth/adapters';
// import type { User as CustomUser } from '@/types'; // Not directly used here, session type is more relevant
import { User as UserModel, Account as AccountModel, connectMongoose } from './mongodb'; // Import Mongoose User model and AccountModel

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

// Conditionally add GoogleProvider
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
  console.log("INFO: Google OAuth Provider configured.");
} else {
  console.warn("WARNING: Google OAuth credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET) not found in .env. Google login will be disabled.");
}

// Conditionally add GithubProvider
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'repo read:user user:email', // Request necessary scopes
        },
      },
    })
  );
  console.log("INFO: GitHub OAuth Provider configured.");
} else {
  console.warn("WARNING: GitHub OAuth credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) not found in .env. GitHub login will be disabled.");
}

if (providers.length === 0) {
  console.error('CRITICAL ERROR: No OAuth providers configured. Login will not function. Please provide credentials for at least one provider (e.g., Google or GitHub) in your .env file and ensure they are correctly named (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET).');
}

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise) as Adapter,
  providers: providers,
  session: {
    strategy: 'jwt', // Using JWT for session strategy
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      await connectMongoose(); // Ensure DB connection

      // Handle initial sign-in (when account and user are present)
      if (account && user) {
        token.accessToken = account.access_token;
        token.provider = account.provider;

        // `user.id` from the adapter during initial sign-in *should* be the MongoDB ObjectId string.
        // We prioritize looking up via Account for robustness.
        const linkedAccount = await AccountModel.findOne({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        }).lean();

        if (linkedAccount && linkedAccount.userId) {
          token.id = linkedAccount.userId.toString();
          console.log(`[JWT Callback] Initial sign-in: Set token.id to "${token.id}" from linked Account.`);
        } else if (user?.id && typeof user.id === 'string' && user.id.length === 24 && /^[0-9a-fA-F]+$/.test(user.id)) {
          // Fallback if linkedAccount isn't found but user.id from adapter seems valid (e.g., credentials sign-in or adapter providing db id)
          token.id = user.id;
          console.log(`[JWT Callback] Initial sign-in: Linked account not found, but user.id ("${user.id}") from adapter/user object appears to be a valid MongoDB ObjectId. Using it for token.id.`);
        }
         else {
          console.error(`[JWT Callback] CRITICAL: Could not determine MongoDB User ID for ${account.provider}:${account.providerAccountId}. User from adapter:`, user, "Profile from provider:", profile);
          delete token.id; // Important: ensure token.id is not a provider ID if it couldn't be resolved to a DB ID.
        }
      }

      // For subsequent JWT calls or if token.id was correctly set above,
      // fetch user details from DB to populate role, status, etc.
      if (token.id && typeof token.id === 'string' && token.id.length === 24 && /^[0-9a-fA-F]+$/.test(token.id)) {
        const dbUser = await UserModel.findById(token.id).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';
          token.email = dbUser.email; // Keep email in token updated from DB

          // First user promotion logic:
          // Only run this during initial sign-in when `account` was present,
          // and if the user is not already an admin.
          if (account && token.role !== 'admin') { // 'account' ensures it's initial OAuth sign-in context
            const userCount = await UserModel.countDocuments();
            if (userCount === 1) {
              console.log(`INFO: First user detected (Email: ${dbUser.email}, ID: ${token.id}). Promoting to admin.`);
              try {
                await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
                token.role = 'admin'; // Update token immediately
                token.status = 'active';
              } catch (e: any) {
                console.error(`ERROR: Failed to promote first user ${token.id} to admin: ${e.message}`);
              }
            }
          }
        } else {
          console.warn(`[JWT Callback] User with DB ID ${token.id} not found in database. Token may be stale.`);
          delete token.role;
          delete token.status;
          delete token.email;
        }
      } else {
         // If token.id is not a valid MongoDB ObjectId string at this point.
        if (token.id) { // Log only if token.id was set but invalid
            console.error(`[JWT Callback] Invalid token.id ("${token.id}") found. It's not a valid MongoDB ObjectId string. Clearing user-specific fields from token.`);
        }
        // Ensure a potentially incorrect id doesn't propagate or cause issues.
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
      if (token.email && session.user) { // Ensure email is passed to session
        session.user.email = token.email as string;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
        await connectMongoose();
        // For OAuth, user.id is the provider's ID. We need to check the DB user linked via the account.
        if (account) { // This is an OAuth sign-in (account object is present)
          const linkedDbAccount = await AccountModel.findOne({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          }).lean();

          if (linkedDbAccount && linkedDbAccount.userId) {
            const dbUser = await UserModel.findById(linkedDbAccount.userId).select('status email').lean();
            if (dbUser?.status === 'suspended') {
              console.log(`Sign-in attempt denied for suspended OAuth user: ${dbUser.email || profile?.email}`);
              return '/auth/signin?error=suspended'; // Redirect to error page
            }
          } else {
            // User is new or account not yet linked by adapter.
            // The adapter will create/link them. Status check isn't applicable here for a brand new user.
            // The default status is 'active' as per schema.
            console.log(`[signIn Callback] New or unlinked OAuth user: ${profile?.email}. Allowing sign-in flow to proceed for adapter processing.`);
          }
        } else if (user && user.id) { 
          // This is likely a credentials sign-in, where user.id IS the MongoDB _id
          // or a non-OAuth context where user.id is expected to be the DB ID.
          if (typeof user.id === 'string' && user.id.length === 24 && /^[0-9a-fA-F]+$/.test(user.id)) {
            const dbUser = await UserModel.findById(user.id).select('status email').lean();
            if (dbUser?.status === 'suspended') {
              console.log(`Sign-in attempt denied for suspended user: ${user.email}`);
              return '/auth/signin?error=suspended';
            }
          } else {
            console.warn(`[signIn Callback] user.id ("${user.id}") is not a valid MongoDB ObjectId for non-OAuth sign-in. This might be an issue.`);
            // Depending on policy, you might deny sign-in here or let it proceed if other checks are in place.
            // For safety, if we don't have an account and user.id isn't a DB id, it's risky.
            // However, NextAuth typically handles adapter user creation before this for new OAuth users.
          }
        }
        return true; // Allow sign-in to proceed
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

    
