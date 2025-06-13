
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
      await connectMongoose();
      let dbUserIdToUse: string | undefined = undefined;

      if (account && account.provider && account.providerAccountId) {
        // This is an OAuth sign-in (e.g., GitHub, Google).
        // The `account` object contains provider-specific details.
        // `user` object here is the user profile from the provider or adapter.
        
        token.accessToken = account.access_token; // Store access token from provider
        token.provider = account.provider;

        // Fetch the Account document linked to this provider account
        const linkedAccount = await AccountModel.findOne({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        }).lean();

        if (linkedAccount && linkedAccount.userId) {
          dbUserIdToUse = linkedAccount.userId.toString();
        } else if (user?.email) {
          // Fallback: If somehow the account isn't linked yet, try to find user by email.
          // This might happen if createUser by adapter has run but linkAccount is pending or
          // if the `user` object in the callback has the correct email.
          console.warn(`[JWT Callback] Linked account for ${account.provider}:${account.providerAccountId} not found or missing userId. Attempting to find user by email: ${user.email}`);
          const userByEmail = await UserModel.findOne({ email: user.email }).select('_id').lean();
          if (userByEmail) {
            dbUserIdToUse = userByEmail._id.toString();
            // It's crucial to ensure the account gets linked if it wasn't.
            // The adapter should handle this, but this is a safeguard.
          }
        }
        if(dbUserIdToUse) console.log(`[JWT Callback] Determined dbUserIdToUse for OAuth user ${user?.email || profile?.email}: ${dbUserIdToUse}`);

      } else if (user?.id) {
        // This case handles credential-based sign-in or if `account` is not present
        // but `user` (from adapter, with DB _id as user.id) is.
        // Check if user.id looks like a MongoDB ObjectId.
        if (user.id.length === 24 && /^[0-9a-fA-F]+$/.test(user.id)) {
            dbUserIdToUse = user.id;
        } else {
            console.warn(`[JWT Callback] user.id ("${user.id}") from non-OAuth flow or existing token does not look like a MongoDB ObjectId.`);
            // If not an ObjectId, and not an OAuth flow, this might be an issue.
            // For OAuth, the above `if (account)` block should have set dbUserIdToUse.
        }
      }
      
      // If this is a token refresh (user and account are null), token.id should already be the dbUserId.
      if (!dbUserIdToUse && token.id && typeof token.id === 'string' && token.id.length === 24 && /^[0-9a-fA-F]+$/.test(token.id) ) {
        dbUserIdToUse = token.id;
      }


      if (dbUserIdToUse) {
        token.id = dbUserIdToUse; // Ensure token.id is the MongoDB ObjectId string
        const dbUser = await UserModel.findById(dbUserIdToUse).select('role email status').lean();
        if (dbUser) {
          token.role = dbUser.role || 'user';
          token.status = dbUser.status || 'active';

          // First user promotion logic:
          // Only run this if `account` and `user` are present, indicating a new user registration via OAuth.
          if (account && user) { 
            const userCount = await UserModel.countDocuments();
            if (userCount === 1 && token.role !== 'admin') {
              console.log(`INFO: First user detected (Email: ${dbUser.email}, ID: ${token.id}). Promoting to admin.`);
              try {
                await UserModel.updateOne({ _id: token.id }, { $set: { role: 'admin', status: 'active' } });
                token.role = 'admin';
                token.status = 'active';
              } catch (e: any) {
                console.error(`ERROR: Failed to promote first user ${token.id} to admin: ${e.message}`);
              }
            }
          }
        } else {
          console.warn(`[JWT Callback] User with DB ID ${token.id} not found in database.`);
          delete token.role;
          delete token.status;
        }
      } else {
        console.error('[JWT Callback] Could not determine a valid MongoDB User ID. Token will be missing user details.');
        delete token.id; // Clear potentially incorrect id
        delete token.role;
        delete token.status;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.accessToken && session) {
        session.accessToken = token.accessToken as string;
      }
      // token.id should now reliably be the MongoDB User _id string
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      if (token.role && session.user) {
        session.user.role = token.role as string;
      }
      if (token.status && session.user) {
        session.user.status = token.status as 'active' | 'suspended';
      }
      return session;
    },
    async signIn({ user, account, profile }) {
        await connectMongoose();
        // user.id here should be the MongoDB _id after adapter processing
        const dbUser = await UserModel.findById(user.id).select('status').lean(); 
        if (dbUser?.status === 'suspended') {
          console.log(`Sign-in attempt denied for suspended user: ${user.email}`);
          return '/auth/signin?error=suspended'; 
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
