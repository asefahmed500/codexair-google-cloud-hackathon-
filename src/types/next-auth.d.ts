
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import type { JWT as NextAuthJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends NextAuthSession {
    accessToken?: string;
    user: {
      id: string;
      status?: 'active' | 'suspended'; // Add status to session user
    } & NextAuthSession['user'];
  }

  interface User extends NextAuthUser {
    // Add custom properties here if needed from the provider profile
    status?: 'active' | 'suspended'; // Ensure User type can have status
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends NextAuthJWT {
    accessToken?: string;
    id?: string; // Or sub for user id from provider
    status?: 'active' | 'suspended'; // Add status to JWT
  }
}
