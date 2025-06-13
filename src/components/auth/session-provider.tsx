
'use client';

import type { Session } from 'next-auth';
import { SessionProvider as Provider } from 'next-auth/react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  session: Session | null;
}

export default function SessionProvider({ children, session }: Props) {
  return (
    <Provider session={session}>
      {children}
    </Provider>
  );
}

