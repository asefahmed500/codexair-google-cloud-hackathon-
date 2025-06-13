
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import SessionProvider from '@/components/auth/session-provider';
import { Toaster } from "@/components/ui/toaster";
import './globals.css';
import { authOptions } from '@/lib/auth'; // Ensure this path is correct

export const metadata: Metadata = {
  title: 'codexair',
  description: 'AI-Powered Code Review Intelligence Platform',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <SessionProvider session={session}>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}

