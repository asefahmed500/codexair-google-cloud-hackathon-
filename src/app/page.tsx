'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Github, Zap, ShieldCheck, LineChart } from 'lucide-react';
import Image from 'next/image';

// Google G logo SVG component
const GoogleIcon = () => (
  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="mr-2 h-5 w-5">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
    <path fill="none" d="M0 0h48v48H0z"></path>
  </svg>
);


export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-xl font-semibold text-foreground">Loading...</div>
      </div>
    );
  }

  if (status === 'authenticated') {
    // This will usually be handled by the useEffect redirect, but as a fallback:
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-xl font-semibold text-foreground">Redirecting to dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <header className="text-center mb-12">
        <Zap className="w-20 h-20 text-primary mx-auto mb-4" />
        <h1 className="text-5xl font-bold text-foreground mb-2 font-headline">codexair</h1>
        <p className="text-xl text-muted-foreground">
          Intelligent Code Analysis & Review Platform.
        </p>
      </header>

      <main className="w-full max-w-4xl">
        <Card className="shadow-xl mb-12">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-headline">Unlock Deeper Code Insights</CardTitle>
            <CardDescription className="text-center text-md">
              Leverage AI to enhance your code quality, identify security vulnerabilities, and streamline your review process.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center p-4 rounded-lg ">
              <Zap className="w-12 h-12 text-accent mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-1">AI-Powered Analysis</h3>
              <p className="text-sm text-muted-foreground">Automated code quality checks and smart suggestions.</p>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg ">
              <ShieldCheck className="w-12 h-12 text-accent mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-1">Security Scanning</h3>
              <p className="text-sm text-muted-foreground">Identify potential vulnerabilities before they become threats.</p>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg ">
              <LineChart className="w-12 h-12 text-accent mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-1">Quality Trends</h3>
              <p className="text-sm text-muted-foreground">Track improvements and maintain high standards.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-center gap-4">
            <Button 
              size="lg" 
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })} 
              className="shadow-md hover:shadow-lg transition-shadow w-full sm:w-auto"
            >
              <Github className="mr-2 h-5 w-5" /> Login with GitHub
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="shadow-md hover:shadow-lg transition-shadow w-full sm:w-auto border-input hover:bg-accent/50"
            >
              <GoogleIcon />
              Login with Google
            </Button>
          </CardFooter>
        </Card>
        
        <section className="text-center">
            <h2 className="text-2xl font-semibold text-foreground mb-6 font-headline">How It Works</h2>
            <div className="grid md:grid-cols-3 gap-8">
                <Card>
                    <CardHeader>
                        <Image src="https://placehold.co/600x400.png?text=Connect+Repo" alt="Connect Repository" width={600} height={400} className="rounded-t-lg" data-ai-hint="connect repository"/>
                    </CardHeader>
                    <CardContent>
                        <CardTitle className="text-xl mb-2">1. Connect</CardTitle>
                        <CardDescription>Securely connect your GitHub repositories.</CardDescription>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <Image src="https://placehold.co/600x400.png?text=Analyze+PRs" alt="Analyze Pull Requests" width={600} height={400} className="rounded-t-lg" data-ai-hint="analyze code"/>
                    </CardHeader>
                    <CardContent>
                        <CardTitle className="text-xl mb-2">2. Analyze</CardTitle>
                        <CardDescription>Initiate AI-powered analysis on your pull requests.</CardDescription>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <Image src="https://placehold.co/600x400.png?text=Get+Insights" alt="Get Insights" width={600} height={400} className="rounded-t-lg" data-ai-hint="insights chart"/>
                    </CardHeader>
                    <CardContent>
                        <CardTitle className="text-xl mb-2">3. Improve</CardTitle>
                        <CardDescription>Receive actionable insights and suggestions to elevate your code.</CardDescription>
                    </CardContent>
                </Card>
            </div>
        </section>

      </main>

      <footer className="mt-16 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
        <p>Powered by Next.js, GitHub, MongoDB, and Google Cloud AI.</p>
      </footer>
    </div>
  );
}
