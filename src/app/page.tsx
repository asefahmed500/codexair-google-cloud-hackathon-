
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
  Briefcase
} from 'lucide-react';
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
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-xl font-semibold text-foreground">Redirecting to dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <header className="text-center mb-12">
        <BarChartBig className="w-20 h-20 text-primary mx-auto mb-4" />
        <h1 className="text-5xl font-bold text-foreground mb-2 font-headline">codexair</h1>
        <p className="text-2xl text-muted-foreground font-light">
          GitHub → AI Analysis → Actionable Insights → Better Code. 🚀
        </p>
      </header>

      <main className="w-full max-w-5xl">
        <Card className="shadow-xl mb-12">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-headline">Intelligent Code Review Automation</CardTitle>
            <CardDescription className="text-center text-md max-w-2xl mx-auto">
              Connect your GitHub repositories, let AI scan every pull request, get instant feedback, find similar code, and track quality trends all in one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center p-4 rounded-lg ">
              <Zap className="w-12 h-12 text-accent mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-1">AI Scans Every PR</h3>
              <p className="text-sm text-muted-foreground">Detects security risks, quality issues, and optimizations automatically.</p>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg ">
              <Lightbulb className="w-12 h-12 text-accent mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-1">Instant Feedback & Scoring</h3>
              <p className="text-sm text-muted-foreground">Get inline fixes, quality scores (1-10), and historical comparisons.</p>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg ">
              <LineChart className="w-12 h-12 text-accent mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-1">Track Progress & Trends</h3>
              <p className="text-sm text-muted-foreground">Dashboards show team metrics, quality trends, and security hotspots.</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-center gap-4 py-6">
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

        <section className="text-center mb-16">
            <h2 className="text-3xl font-semibold text-foreground mb-8 font-headline">How codexair Works</h2>
            <div className="grid md:grid-cols-5 gap-4">
                <FeatureStepCard
                    icon={<Github className="w-10 h-10 text-primary mb-2" />}
                    step="1. Login & Connect"
                    description="Log in with GitHub & connect your repositories in one click."
                    imageSrc="https://placehold.co/300x200.png"
                    imageAlt="Login with GitHub and Connect Repositories"
                    aiHint="github connect"
                />
                <FeatureStepCard
                    icon={<Zap className="w-10 h-10 text-primary mb-2" />}
                    step="2. AI Scans PRs"
                    description="AI scans every PR, detecting security risks, quality issues, and optimizations."
                    imageSrc="https://placehold.co/300x200.png"
                    imageAlt="AI Scans Pull Requests"
                    aiHint="ai scan"
                />
                <FeatureStepCard
                    icon={<Lightbulb className="w-10 h-10 text-primary mb-2" />}
                    step="3. Instant Feedback"
                    description="Get instant feedback: inline fixes, scores (1-10), and historical comparisons."
                    imageSrc="https://placehold.co/300x200.png"
                    imageAlt="Instant Feedback on Code"
                    aiHint="code feedback"
                />
                <FeatureStepCard
                    icon={<Search className="w-10 h-10 text-primary mb-2" />}
                    step="4. Vector Search"
                    description="Search similar code: find duplicates or past fixes using vector search."
                    imageSrc="https://placehold.co/300x200.png"
                    imageAlt="Vector Search for Similar Code"
                    aiHint="code search"
                />
                <FeatureStepCard
                    icon={<LineChart className="w-10 h-10 text-primary mb-2" />}
                    step="5. Track Progress"
                    description="Track progress with dashboards showing team metrics, trends, and security hotspots."
                    imageSrc="https://placehold.co/300x200.png"
                    imageAlt="Track Progress with Dashboards"
                    aiHint="dashboard metrics"
                />
            </div>
        </section>

        <section className="text-center mb-16">
            <h2 className="text-3xl font-semibold text-foreground mb-8 font-headline">Unique Value Proposition</h2>
            <div className="grid md:grid-cols-3 gap-8">
                <ValuePropCard
                    icon={<Code className="w-10 h-10 text-accent mb-3" />}
                    title="For Developers"
                    items={[
                        "AI pair programmer in code reviews",
                        "Instant security vulnerability detection",
                        "Historical context for every change"
                    ]}
                />
                <ValuePropCard
                    icon={<Users className="w-10 h-10 text-accent mb-3" />}
                    title="For Teams"
                    items={[
                        "Quantifiable code quality metrics",
                        "Identify knowledge gaps through patterns",
                        "Reduce onboarding time with smart suggestions"
                    ]}
                />
                <ValuePropCard
                    icon={<ShieldCheck className="w-10 h-10 text-accent mb-3" />}
                    title="For Enterprises"
                    items={[
                        "Compliance reporting (SOC2, ISO27001)",
                        "Risk mitigation through early detection",
                        "Benchmark against industry standards"
                    ]}
                />
            </div>
        </section>
        
        <section className="text-center mb-16">
          <h2 className="text-3xl font-semibold text-foreground mb-8 font-headline">A Developer's Journey with codexair</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <JourneyStepCard
              icon={<LogIn className="w-10 h-10 text-primary mb-3" />}
              title="Getting Started"
              items={[
                "You sign in with your GitHub account (like logging into any app with Google)",
                "You pick which of your code repositories you want the system to analyze",
                "The platform automatically imports your recent pull requests and starts learning about your codebase",
              ]}
            />
            <JourneyStepCard
              icon={<Workflow className="w-10 h-10 text-primary mb-3" />}
              title="Daily Workflow"
              items={[
                "When you create a new pull request, the system automatically:",
                "- Reads through all your code changes",
                "- Checks for security problems (like places hackers could attack)",
                "- Looks for code quality issues (messy or hard-to-maintain code)",
                "- Compares your code to similar code your team wrote before",
              ]}
            />
            <JourneyStepCard
              icon={<Eye className="w-10 h-10 text-primary mb-3" />}
              title="What You See"
              items={[
                "A dashboard showing your code quality trends over time",
                "Color-coded highlights on your code: red for security risks, yellow for problems, blue for suggestions",
                "Smart recommendations like \"Hey, your teammate Sarah fixed this exact same bug last month - here's how she did it\"",
                "A quality score for each pull request (like a grade from 1-10)",
              ]}
            />
            <JourneyStepCard
              icon={<HelpCircle className="w-10 h-10 text-primary mb-3" />}
              title="Getting Help"
              items={[
                "Click on any highlighted issue to see why it's a problem and how to fix it",
                "The system shows you examples of how your team solved similar issues before",
                "You get notifications when critical security issues are found",
              ]}
            />
          </div>
        </section>

        <section className="text-center mb-16">
            <h2 className="text-3xl font-semibold text-foreground mb-8 font-headline">What You Can Achieve</h2>
            <div className="grid md:grid-cols-3 gap-8">
                <BenefitCard
                    icon={<Code className="w-12 h-12 text-accent mb-4" />}
                    title="Developers"
                    description="Fix issues faster with AI-powered code reviews and actionable suggestions."
                />
                <BenefitCard
                    icon={<Users className="w-12 h-12 text-accent mb-4" />}
                    title="Team Leads"
                    description="Monitor code health, track quality trends, and manage team performance via real-time analytics."
                />
                <BenefitCard
                    icon={<ShieldCheck className="w-12 h-12 text-accent mb-4" />}
                    title="Security Engineers"
                    description="Catch vulnerabilities before they merge, ensuring robust application security."
                />
            </div>
        </section>

        <section className="text-center mb-16">
          <h2 className="text-3xl font-semibold text-foreground mb-8 font-headline">For Admins (Team Leads/Managers)</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AdminFeatureCard
              icon={<Users className="w-10 h-10 text-primary mb-3" />}
              title="Team Management"
              items={[
                "Set up who can see what (some developers might only see their own code, others can see everything)",
                "Control notification settings (who gets alerted about critical issues)",
                "Manage access to different repositories",
              ]}
            />
            <AdminFeatureCard
              icon={<BarChartHorizontalBig className="w-10 h-10 text-primary mb-3" />}
              title="Monitoring & Reporting"
              items={[
                "View team-wide dashboards showing:",
                "- Overall code quality trends",
                "- Which files or areas have the most problems",
                "- Which developers are improving the most",
                "- Security hotspots that need attention",
                "Get weekly/monthly reports on team progress",
                "See leaderboards of who's fixing the most issues",
              ]}
            />
            <AdminFeatureCard
              icon={<Settings className="w-10 h-10 text-primary mb-3" />}
              title="Configuration"
              items={[
                "Set rules for what counts as \"critical\" vs \"minor\" issues",
                "Configure which types of problems should block code from going live",
                "Set up integrations with Slack or email for important alerts",
                "Customize analysis settings for different programming languages",
              ]}
            />
            <AdminFeatureCard
              icon={<Siren className="w-10 h-10 text-primary mb-3" />}
              title="Emergency Response"
              items={[
                "Get immediate alerts when critical security vulnerabilities are found",
                "Ability to block dangerous code from being deployed",
                "Track which security issues have been fixed vs still open",
              ]}
            />
            <AdminFeatureCard
              icon={<Briefcase className="w-10 h-10 text-primary mb-3" />}
              title="Business Intelligence"
              items={[
                "See which parts of your codebase are most problematic",
                "Track technical debt (accumulated code problems) over time",
                "Compare your team's code quality to industry benchmarks",
                "Plan refactoring efforts based on data about problem areas",
              ]}
            />
          </div>
          <p className="mt-8 text-lg text-muted-foreground">
            The system essentially works like having an expert code reviewer who never sleeps, remembers every bug your team has ever fixed, and can instantly spot patterns across thousands of lines of code - but presents everything in a simple, actionable way for both individual developers and their managers.
          </p>
        </section>

      </main>

      <footer className="mt-16 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
        <p>Powered by Next.js, GitHub, MongoDB, and Google Cloud AI.</p>
      </footer>
    </div>
  );
}

interface FeatureStepCardProps {
  icon: React.ReactNode;
  step: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  aiHint: string;
}

function FeatureStepCard({ icon, step, description, imageSrc, imageAlt, aiHint }: FeatureStepCardProps) {
  return (
    <Card className="flex flex-col items-center text-center hover:shadow-lg transition-shadow">
        <CardHeader className="items-center pb-3">
            {icon}
            <CardTitle className="text-md font-semibold">{step}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col items-center">
            <Image src={imageSrc} alt={imageAlt} width={150} height={100} className="rounded-md mb-3 mx-auto object-cover" data-ai-hint={aiHint}/>
            <CardDescription className="text-xs">{description}</CardDescription>
        </CardContent>
    </Card>
  );
}

interface BenefitCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function BenefitCard({ icon, title, description}: BenefitCardProps) {
  return (
    <Card className="p-6 hover:shadow-lg transition-shadow">
        <div className="flex flex-col items-center text-center">
            {icon}
            <CardTitle className="text-xl mb-2">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
        </div>
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
    <Card className="p-6 hover:shadow-lg transition-shadow flex flex-col items-center text-center h-full">
      <CardHeader className="items-center p-2">
        {icon}
        <CardTitle className="text-xl my-2">{title}</CardTitle>
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

interface JourneyStepCardProps {
  icon: React.ReactNode;
  title: string;
  items: string[];
}

function JourneyStepCard({ icon, title, items }: JourneyStepCardProps) {
  return (
    <Card className="flex flex-col text-left hover:shadow-lg transition-shadow h-full">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        {icon}
        <div className="flex flex-col">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-2 text-sm text-muted-foreground list-none p-0">
          {items.map((item, index) => {
            const isSubItem = item.startsWith("- ");
            const content = isSubItem ? item.substring(2) : item;
            return (
              <li key={index} className={`flex items-start ${isSubItem ? 'ml-4' : ''}`}>
                {isSubItem ? (
                  <span className="flex-shrink-0 mr-2 mt-1 text-primary">-&gt;</span>
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2 mt-1 text-primary flex-shrink-0" />
                )}
                <span>{content}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

interface AdminFeatureCardProps {
  icon: React.ReactNode;
  title: string;
  items: string[];
}

function AdminFeatureCard({ icon, title, items }: AdminFeatureCardProps) {
  return (
    <Card className="flex flex-col text-left hover:shadow-lg transition-shadow h-full">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        {icon}
        <div className="flex flex-col">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-2 text-sm text-muted-foreground list-none p-0">
          {items.map((item, index) => {
            const isSubItem = item.startsWith("- ");
            const content = isSubItem ? item.substring(2) : item;
            return (
              <li key={index} className={`flex items-start ${isSubItem ? 'ml-4' : ''}`}>
                {isSubItem ? (
                  <span className="flex-shrink-0 mr-2 mt-1 text-primary">-&gt;</span>
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2 mt-1 text-primary flex-shrink-0" />
                )}
                <span>{content}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
