'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, Zap } from 'lucide-react';

export default function LoginForm() {
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <Zap className="w-16 h-16 text-primary mx-auto mb-3" />
        <CardTitle className="text-3xl font-bold font-headline">Welcome to CodeReviewAI</CardTitle>
        <CardDescription>Sign in to access your AI-powered code analysis dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          variant="default" 
          size="lg" 
          className="w-full text-lg py-6 shadow-md hover:shadow-lg transition-shadow" 
          onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
        >
          <Github className="mr-3 h-6 w-6" />
          Sign in with GitHub
        </Button>
      </CardContent>
    </Card>
  );
}
