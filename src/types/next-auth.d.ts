import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';
import type { JWT as NextAuthJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends NextAuthSession {
    accessToken?: string;
    user: {
      id: string;
    } & NextAuthSession['user'];
  }

  interface User extends NextAuthUser {
    // Add custom properties here if needed from the provider profile
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends NextAuthJWT {
    accessToken?: string;
    id?: string; // Or sub for user id from provider
  }
}
