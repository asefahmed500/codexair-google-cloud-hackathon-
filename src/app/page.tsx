
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Navbar from '@/components/layout/navbar';
import {
  Zap,
  ShieldCheck,
  LineChart,
  Search,
  BarChartBig,
  Code,
  CheckCircle,
  ArrowDownCircle,
  Users
} from 'lucide-react';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // No automatic redirect from homepage even if logged in,
    // as user might want to see public homepage content like features/about.
    // Navbar will show dashboard links if logged in.
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xl font-semibold text-foreground">Loading...</div>
        </div>
      </div>
    );
  }
  
  const handleScrollToFeatures = () => {
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center">
        {/* Hero Section */}
        <section className="w-full py-20 md:py-32 bg-gradient-to-br from-background via-secondary/30 to-background">
          <div className="container mx-auto text-center px-4">
            <BarChartBig className="w-20 h-20 text-primary mx-auto mb-8" />
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 font-headline">
              Welcome to codexair
            </h1>
            <p className="text-lg md:text-2xl text-muted-foreground font-light max-w-3xl mx-auto mb-10">
              Elevate Your Code. AI-Powered Analysis for Superior Software Quality & Security. Discover actionable insights and streamline your development workflow.
            </p>
            <Button size="lg" onClick={handleScrollToFeatures} className="shadow-lg hover:shadow-xl transition-shadow text-lg px-8 py-3">
              <ArrowDownCircle className="mr-2 h-5 w-5" /> Learn More
            </Button>
          </div>
        </section>

        {/* Core Features Section */}
        <section id="features" className="w-full py-16 md:py-24 bg-secondary/50">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground text-center mb-16 font-headline">
              Core Features
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <FeatureCard
                icon={<Zap className="w-10 h-10 text-primary" />}
                title="AI-Powered Review"
                description="Automated, intelligent analysis of pull requests for quality, security, and performance."
              />
              <FeatureCard
                icon={<ShieldCheck className="w-10 h-10 text-primary" />}
                title="Security Scanning"
                description="Identify potential vulnerabilities and common weaknesses (CWEs) in your codebase."
              />
              <FeatureCard
                icon={<Search className="w-10 h-10 text-primary" />}
                title="Semantic Code Search"
                description="Find similar code patterns and past fixes across analyses using vector search."
              />
              <FeatureCard
                icon={<LineChart className="w-10 h-10 text-primary" />}
                title="Quality Dashboards"
                description="Track code quality, complexity, and maintainability trends over time."
              />
            </div>
          </div>
        </section>

        {/* Why Choose codexair Section */}
        <section className="w-full py-16 md:py-24 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground text-center mb-16 font-headline">
              Why Choose codexair?
            </h2>
            <div className="grid md:grid-cols-2 gap-10 max-w-4xl mx-auto">
              <ValuePropCard
                icon={<Code className="w-10 h-10 text-accent" />}
                title="For Developers"
                items={[
                  "Your AI pair programmer for insightful reviews.",
                  "Proactively catch issues before they merge.",
                  "Learn from historical code patterns and best practices.",
                  "Reduce cognitive load during code reviews.",
                ]}
              />
              <ValuePropCard
                icon={<Users className="w-10 h-10 text-accent" />}
                title="For Teams"
                items={[
                  "Standardize code quality across all projects.",
                  "Identify common pitfalls and knowledge gaps.",
                  "Streamline review cycles & improve velocity.",
                  "Foster a culture of continuous improvement.",
                ]}
              />
            </div>
          </div>
        </section>
        
        {/* Brief About Us Snippet - Placeholder */}
        <section className="w-full py-16 md:py-20 bg-secondary/30">
            <div className="container mx-auto px-4 text-center max-w-3xl">
                <h2 className="text-3xl md:text-4xl font-semibold text-foreground mb-6 font-headline">Our Mission</h2>
                <p className="text-lg text-muted-foreground">
                    At codexair, we're passionate about empowering developers and teams to build higher quality, more secure software with greater efficiency. We leverage the latest advancements in AI to provide intelligent tools that integrate seamlessly into your workflow.
                </p>
            </div>
        </section>

      </main>

      {/* Footer Section */}
      <footer className="py-10 text-center text-sm text-muted-foreground border-t bg-background">
        <div className="container mx-auto">
          <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
          <p className="mt-1">Empowering developers with AI-driven code intelligence.</p>
        </div>
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
    <Card className="flex flex-col items-center text-center hover:shadow-xl transition-shadow duration-300 overflow-hidden h-full bg-card border p-6 md:p-8 rounded-lg">
      <div className="p-4 bg-primary/10 rounded-full mb-6 inline-flex">
        {icon}
      </div>
      <CardTitle className="text-xl font-semibold text-foreground mb-3">{title}</CardTitle>
      <CardDescription className="text-sm text-muted-foreground flex-grow">{description}</CardDescription>
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
    <Card className="p-6 md:p-8 hover:shadow-lg transition-shadow flex flex-col items-center text-center h-full bg-card border rounded-lg">
      <div className="p-3 bg-accent/10 rounded-full mb-5 inline-flex">
        {icon}
      </div>
      <CardTitle className="text-xl my-2 font-semibold text-foreground">{title}</CardTitle>
      <CardContent className="flex-grow mt-3">
        <ul className="space-y-2.5 text-sm text-muted-foreground list-none p-0">
          {items.map((item, index) => (
            <li key={index} className="flex items-start text-left">
              <CheckCircle className="h-4 w-4 mr-2.5 mt-0.5 text-primary flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
