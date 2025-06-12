
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, ShieldCheck, LineChart, Search, Users, FileText, Lightbulb, GitMerge, Settings, Activity, BarChartBig } from 'lucide-react';

interface FeatureDetailProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  details?: string[];
}

function FeatureDetailCard({ icon, title, description, details }: FeatureDetailProps) {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          {icon}
          <CardTitle className="text-2xl font-headline">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {details && details.length > 0 && (
        <CardContent className="flex-grow">
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

export default function FeaturesPage() {
  const userFeatures: FeatureDetailProps[] = [
    {
      icon: <Zap className="w-8 h-8 text-primary" />,
      title: "AI-Powered Code Analysis",
      description: "In-depth automated review of your pull requests.",
      details: [
        "Code Quality Assessment (Readability, Structure, Best Practices).",
        "Complexity & Maintainability Scores.",
        "Security Vulnerability Identification (e.g., CWEs) with severity.",
        "Actionable Improvement Suggestions (Performance, Style, Potential Bugs)."
      ]
    },
    {
      icon: <BarChartBig className="w-8 h-8 text-primary" />,
      title: "Insightful Dashboard",
      description: "Visualize code health and track progress effectively.",
      details: [
        "Analytics Overview: Total analyses, average quality, critical issues.",
        "Recent Analyses: Quick access to latest reviews.",
        "Quality Trends: Visualize quality scores over time.",
        "Top Security Issues & Improvement Suggestions.",
        "Security Hotspots: Identify problematic files."
      ]
    },
    {
      icon: <Search className="w-8 h-8 text-primary" />,
      title: "Semantic Code Search",
      description: "Find similar code patterns and past resolutions.",
      details: [
        "Leverages vector embeddings for intelligent search.",
        "Identify how similar issues were addressed in other analyses.",
        "Helps in understanding recurring patterns and promoting consistency."
      ]
    },
    {
      icon: <GitMerge className="w-8 h-8 text-primary" />,
      title: "Pull Request Comparison",
      description: "Compare two pull requests side-by-side.",
      details: [
        "View metadata and full analysis summaries for two PRs from the same repository.",
        "Useful for understanding evolving changes or comparing different approaches.",
        "Option to initiate analysis for unanalyzed PRs directly from comparison view."
      ]
    },
    {
      icon: <Lightbulb className="w-8 h-8 text-primary" />,
      title: "Explain My Code",
      description: "Get AI-generated explanations for any code snippet.",
      details: [
        "Paste code, optionally specify language.",
        "Ask predefined questions (e.g., \"What does this do?\") or your own custom questions.",
        "Aids in understanding complex code or learning new patterns."
      ]
    }
  ];

  const adminFeatures: FeatureDetailProps[] = [
    {
      icon: <Settings className="w-8 h-8 text-accent" />,
      title: "Admin Dashboard",
      description: "Platform-wide administrative overview.",
      details: [
        "View total users, total synced repositories, and total analyses performed.",
      ]
    },
    {
      icon: <Users className="w-8 h-8 text-accent" />,
      title: "User Management",
      description: "Manage user roles and account status.",
      details: [
        "View all registered users.",
        "Promote users to admin or demote admins to user.",
        "Change user account status (active, suspended).",
        "Safeguards to prevent accidental admin lockout."
      ]
    },
    {
      icon: <FileText className="w-8 h-8 text-accent" />,
      title: "Analysis Summary Reports",
      description: "Generate and download system-wide analysis reports.",
      details: [
        "Summarizes all pull request analyses performed on the platform.",
        "Downloadable as a CSV file for external use and record-keeping."
      ]
    },
    {
      icon: <Activity className="w-8 h-8 text-accent" />,
      title: "Audit Logs",
      description: "Track important administrative actions.",
      details: [
        "Logs actions like user role changes and status updates.",
        "Provides accountability and helps in monitoring administrative activities."
      ]
    }
  ];


  return (
    <div className="min-h-screen bg-secondary/50 flex flex-col">
      <Navbar />
      <main className="flex-1 container py-12 md:py-16">
        <section className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 font-headline">
            codexair Features
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Explore the comprehensive suite of tools codexair offers to elevate your code quality, enhance security, and streamline your development workflow.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-foreground mb-8 text-center md:text-left font-headline">
            For Developers & Teams
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userFeatures.map(feature => (
              <FeatureDetailCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold text-foreground mb-8 text-center md:text-left font-headline">
            Administrative Capabilities
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {adminFeatures.map(feature => (
              <FeatureDetailCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>
      </main>
      <footer className="py-10 text-center text-sm text-muted-foreground border-t bg-background">
        <div className="container mx-auto">
          <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
          <p className="mt-1">Empowering developers with AI-driven code intelligence.</p>
        </div>
      </footer>
    </div>
  );
}
