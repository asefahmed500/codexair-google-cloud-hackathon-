
'use client';
import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react'; // Added signIn
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import AnalyticsOverview from '@/components/dashboard/analytics-overview';
import RecentReviews from '@/components/dashboard/recent-reviews';
import QualityTrends from '@/components/dashboard/quality-trends';
import TopIssues from '@/components/dashboard/top-issues';
import SecurityHotspots from '@/components/dashboard/security-hotspots'; 
import TeamMetrics from '@/components/dashboard/team-metrics'; 
import ConnectedRepositories from '@/components/dashboard/connected-repositories';
import { DashboardData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import Navbar from '@/components/layout/navbar';
import DashboardLoading from './loading'; 
import { BarChartBig, Shield, GitFork, Github, AlertTriangle } from 'lucide-react'; // Added Github, AlertTriangle
import { Alert, AlertDescription } from "@/components/ui/alert"; // Added Alert components
import { toast } from '@/hooks/use-toast';

interface LinkedAccountProviders {
  github: boolean;
  google: boolean;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<LinkedAccountProviders | null>(null);
  const [loadingLinkedProviders, setLoadingLinkedProviders] = useState(true);

  useEffect(() => {
    if (status === 'loading') return; 

    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      if (session?.user?.role === 'admin') {
        router.replace('/admin'); 
        return; 
      }
      fetchDashboardData();
      fetchLinkedAccounts();
    }
  }, [status, session, router]);

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        let errorMessage = `Failed to fetch dashboard data. Status: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorData.details || errorMessage;
        } catch (e) {
          const textError = await response.text();
          console.error("Non-JSON error response from /api/dashboard:", textError);
          if (textError.toLowerCase().includes("<html")) {
            errorMessage = `API error ${response.status}: Server returned an unexpected response. Check console for details.`;
          } else {
            errorMessage = `API error ${response.status}: ${textError.substring(0, 200) || response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }
      const data: DashboardData = await response.json();
      setDashboardData(data);
    } catch (err: any) {
      console.error("Error in fetchDashboardData:", err);
      setError(err.message || "An unknown error occurred while fetching data.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchLinkedAccounts() {
    setLoadingLinkedProviders(true);
    try {
      const response = await fetch('/api/user/linked-accounts');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch linked accounts status');
      }
      const data: LinkedAccountProviders = await response.json();
      setLinkedProviders(data);
    } catch (err: any) {
      console.error("Error fetching linked accounts:", err);
      // Don't set a global error for this, as dashboard can still load
      toast({ title: "Info", description: "Could not verify GitHub account linkage status.", variant: "default" });
    } finally {
      setLoadingLinkedProviders(false);
    }
  }
  
  if (session?.user?.role === 'admin' && status === 'authenticated') {
    return <DashboardLoading />; 
  }

  if (status === 'loading' || (loading && !dashboardData && !error) || (loadingLinkedProviders && !linkedProviders)) {
    return <DashboardLoading />;
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex items-center justify-center">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Dashboard</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={fetchDashboardData} className="mt-4">Try Again</Button>
            </CardContent>
          </Card>
        </main>
        <footer className="py-6 border-t bg-background">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} codexair.
          </div>
        </footer>
      </div>
    );
  }

  if (!session) return null; 

  if (!loading && !error && (!dashboardData || (dashboardData.overview.totalAnalyses === 0 && dashboardData.connectedRepositories.length === 0) ) ) {
    // This is the "Welcome / Get Started" screen
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex items-center justify-center">
          <Card className="w-full max-w-lg text-center shadow-xl">
            <CardHeader className="items-center">
              <BarChartBig className="w-16 h-16 text-primary mb-4" />
              <CardTitle className="text-2xl sm:text-3xl font-headline text-primary">Welcome to codexair!</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-2">
                Your intelligent code review assistant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               {linkedProviders && !linkedProviders.github && (
                <Alert variant="default" className="text-left border-primary/50 bg-primary/5">
                    <Github className="h-5 w-5 text-primary" />
                    <CardTitle className="text-md text-primary mb-1">Connect GitHub for Full Functionality</CardTitle>
                    <AlertDescription className="text-sm text-primary-foreground/80">
                        👋 You appear to be signed in (possibly via Google).
                        To analyze your GitHub repositories and pull requests, please connect your GitHub account.
                    </AlertDescription>
                    <Button
                        onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
                        variant="default"
                        size="sm"
                        className="mt-3 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <Github className="mr-2 h-4 w-4" /> Connect GitHub Account
                    </Button>
                </Alert>
              )}
              <p className="text-lg text-muted-foreground">
                It looks like you haven't analyzed any pull requests or connected any repositories yet.
              </p>
              <p className="text-md">
                Get started by connecting a repository and analyzing your first PR to unlock powerful code insights.
              </p>
              <Button asChild size="lg" className="shadow-md hover:shadow-lg transition-shadow bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/analyze">Connect Repositories & Start Analyzing</Link>
              </Button>
            </CardContent>
             <CardFooter className="justify-center pt-4">
                 <p className="text-xs text-muted-foreground">Empowering developers with AI-driven code intelligence.</p>
             </CardFooter>
          </Card>
        </main>
        <footer className="py-6 border-t bg-background">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} codexair.
          </div>
        </footer>
      </div>
    );
  }

  // Main dashboard display
  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-headline">codexair Dashboard</h1>
        </div>
        
        {!loadingLinkedProviders && linkedProviders && !linkedProviders.github && (
           <Alert variant="default" className="mb-6 border-primary/50 bg-primary/5">
                <Github className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg text-primary mb-1">Connect GitHub for Full Functionality</CardTitle>
                <AlertDescription className="text-sm text-primary-foreground/80">
                    👋 You appear to be signed in (possibly via Google).
                    To analyze your GitHub repositories and pull requests, please connect your GitHub account.
                </AlertDescription>
                <Button
                    onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
                    variant="default"
                    size="sm"
                    className="mt-3 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                    <Github className="mr-2 h-4 w-4" /> Connect GitHub Account
                </Button>
            </Alert>
        )}
        
        {dashboardData && ( 
          <div className="grid gap-6">
            <AnalyticsOverview overview={dashboardData.overview} />
            <div className="grid md:grid-cols-2 gap-6">
              <ConnectedRepositories repositories={dashboardData.connectedRepositories} />
              <RecentReviews reviews={dashboardData.recentAnalyses} />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <QualityTrends trends={dashboardData.qualityTrends} />
              <SecurityHotspots hotspots={dashboardData.securityHotspots} />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <TopIssues title="Top Security Issues" issues={dashboardData.topSecurityIssues} issueType="security" />
              <TopIssues title="Top Improvement Suggestions" issues={dashboardData.topSuggestions} issueType="suggestion" />
            </div>
             <div className="grid md:grid-cols-1 gap-6">
                <TeamMetrics metrics={dashboardData.teamMetrics} />
            </div>
          </div>
        ) }
      </main>
       <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair.
        </div>
      </footer>
    </div>
  );
}
