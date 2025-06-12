'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Github, Zap, ShieldCheck, LineChart } from 'lucide-react';
import Image from 'next/image';

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
        <h1 className="text-5xl font-bold text-foreground mb-2 font-headline">CodeReviewAI</h1>
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
          <CardFooter className="flex justify-center">
            <Button size="lg" onClick={() => signIn('github')} className="shadow-md hover:shadow-lg transition-shadow">
              <Github className="mr-2 h-5 w-5" /> Login with GitHub
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
        <p>&copy; {new Date().getFullYear()} CodeReviewAI. All rights reserved.</p>
        <p>Powered by Next.js, GitHub, MongoDB, and Google Cloud AI.</p>
      </footer>
    </div>
  );
}
