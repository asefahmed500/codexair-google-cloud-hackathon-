
import LoginForm from '@/components/auth/login-form';
import { Suspense } from 'react';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Suspense fallback={<div className="text-foreground">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

