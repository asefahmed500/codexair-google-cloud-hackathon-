
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import type { JWT as NextAuthJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends NextAuthSession {
    accessToken?: string;
    user: {
      id: string;
      role?: 'user' | 'admin'; // Explicitly add role
      status?: 'active' | 'suspended';
    } & Omit<NextAuthSession['user'], 'id' | 'role' | 'status'>; // Omit fields we are explicitly defining
  }

  interface User extends NextAuthUser {
    role?: 'user' | 'admin'; // Ensure User type can have role
    status?: 'active' | 'suspended';
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends NextAuthJWT {
    accessToken?: string;
    id?: string;
    role?: 'user' | 'admin'; // Add role to JWT
    status?: 'active' | 'suspended';
  }
}
