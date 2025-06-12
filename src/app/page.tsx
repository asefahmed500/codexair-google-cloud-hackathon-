
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Github,
  Zap,
  ShieldCheck,
  LineChart,
  Search,
  BarChartBig,
  Lightbulb,
  Users,
  Code,
  CheckCircle,
  LogIn,
  Eye,
  HelpCircle,
  Workflow,
  Settings,
  Bell, 
  BarChartHorizontalBig, 
  Siren, 
  Briefcase, 
  UserPlus,
} from 'lucide-react';
// Removed Image import as it's no longer used in FeatureCard

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
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-xl font-semibold text-foreground">Redirecting to dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <header className="text-center mb-12 pt-16">
        <BarChartBig className="w-20 h-20 text-primary mx-auto mb-4" />
        <h1 className="text-5xl font-bold text-foreground mb-3 font-headline">codexair</h1>
        <p className="text-2xl text-muted-foreground font-light max-w-2xl mx-auto">
          AI-Powered Code Intelligence. Analyze PRs, find vulnerabilities, track quality, and ship better code, faster.
        </p>
      </header>

      <main className="w-full max-w-5xl">
        <Card className="shadow-xl mb-16 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-headline text-primary">Unlock Your Code's Potential</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
             <p className="text-lg text-muted-foreground mb-8">
              Join codexair or sign in to continue. It's free and takes seconds.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                size="lg"
                onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
                className="shadow-md hover:shadow-lg transition-shadow w-full text-lg py-3"
                >
                <UserPlus className="mr-2 h-5 w-5" /> Sign Up with GitHub
                </Button>
                <Button
                size="lg"
                variant="outline"
                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                className="shadow-md hover:shadow-lg transition-shadow w-full border-input hover:bg-accent/10 text-lg py-3"
                >
                <GoogleIcon />
                Sign Up with Google
                </Button>
                <Button
                size="lg"
                variant="secondary" // Or another variant if "Login" needs to look different
                onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
                className="shadow-md hover:shadow-lg transition-shadow w-full text-lg py-3"
                >
                <LogIn className="mr-2 h-5 w-5" /> Login with GitHub
                </Button>
                <Button
                size="lg"
                variant="outline" 
                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                className="shadow-md hover:shadow-lg transition-shadow w-full border-input hover:bg-accent/10 text-lg py-3"
                >
                <GoogleIcon />
                Login with Google
                </Button>
            </div>
          </CardContent>
        </Card>

        <section className="text-center mb-20">
            <h2 className="text-3xl font-semibold text-foreground mb-10 font-headline">Core Features</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                <FeatureCard
                    icon={<Zap className="w-12 h-12 text-primary mb-3" />}
                    title="AI-Powered Review"
                    description="Automated analysis of pull requests for quality, security, and performance."
                />
                <FeatureCard
                    icon={<ShieldCheck className="w-12 h-12 text-primary mb-3" />}
                    title="Security Scanning"
                    description="Identifies potential vulnerabilities and common weaknesses (CWEs)."
                />
                <FeatureCard
                    icon={<Search className="w-12 h-12 text-primary mb-3" />}
                    title="Semantic Code Search"
                    description="Find similar code patterns and past fixes across your analyses using vector search."
                />
                <FeatureCard
                    icon={<LineChart className="w-12 h-12 text-primary mb-3" />}
                    title="Quality Dashboards"
                    description="Track code quality, complexity, and maintainability trends over time."
                />
            </div>
        </section>

        <section className="text-center mb-20 py-12 bg-secondary/50 rounded-lg">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-semibold text-foreground mb-10 font-headline">Why Choose codexair?</h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <ValuePropCard
                    icon={<Code className="w-10 h-10 text-accent mb-3" />}
                    title="For Developers"
                    items={[
                        "Your AI pair programmer for reviews.",
                        "Catch issues before they merge.",
                        "Learn from historical code patterns.",
                    ]}
                />
                <ValuePropCard
                    icon={<Users className="w-10 h-10 text-accent mb-3" />}
                    title="For Teams"
                    items={[
                        "Standardize code quality across projects.",
                        "Identify common pitfalls and knowledge gaps.",
                        "Streamline review cycles and improve velocity.",
                    ]}
                />
            </div>
          </div>
        </section>

      </main>

      <footer className="mt-16 py-8 text-center text-sm text-muted-foreground border-t w-full">
        <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
        <p>Empowering developers with AI-driven code intelligence.</p>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Card className="flex flex-col items-center text-center hover:shadow-xl transition-shadow duration-300 overflow-hidden h-full">
        <CardHeader className="items-center pb-3 pt-6">
            {icon}
            <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col items-center px-4 pb-6">
            {/* Image section removed */}
            <CardDescription className="text-sm">{description}</CardDescription>
        </CardContent>
    </Card>
  );
}

interface ValuePropCardProps {
  icon: React.ReactNode;
  title: string;
  items: string[];
}

function ValuePropCard({ icon, title, items }: ValuePropCardProps) {
  return (
    <Card className="p-6 hover:shadow-lg transition-shadow flex flex-col items-center text-center h-full bg-card">
      <CardHeader className="items-center p-2">
        {icon}
        <CardTitle className="text-xl my-2 font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-2 text-sm text-muted-foreground list-none p-0">
          {items.map((item, index) => (
            <li key={index} className="flex items-start">
              <CheckCircle className="h-4 w-4 mr-2 mt-0.5 text-primary flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
    
