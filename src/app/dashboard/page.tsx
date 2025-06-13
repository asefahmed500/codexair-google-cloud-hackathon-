
'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import AnalyticsOverview from '@/components/dashboard/analytics-overview';
import RecentReviews from '@/components/dashboard/recent-reviews';
import QualityTrends from '@/components/dashboard/quality-trends';
import TopIssues from '@/components/dashboard/top-issues';
import SecurityHotspots from '@/components/dashboard/security-hotspots'; 
import TeamMetrics from '@/components/dashboard/team-metrics'; 
import { DashboardData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import Navbar from '@/components/layout/navbar';
import DashboardLoading from './loading'; 
import { BarChartBig, Shield } from 'lucide-react'; 

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchDashboardData();
    }
  }, [status, router]);

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

  if (status === 'loading' || (loading && !dashboardData && !error)) {
    return <DashboardLoading />;
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container py-8 flex items-center justify-center">
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
          <div className="container text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} codexair.
          </div>
        </footer>
      </div>
    );
  }

  if (!session) return null;

  if (!loading && !error && (!dashboardData || dashboardData.overview.totalAnalyses === 0)) {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container py-8 flex items-center justify-center">
          <Card className="w-full max-w-lg text-center shadow-xl">
            <CardHeader className="items-center">
              <BarChartBig className="w-16 h-16 text-primary mb-4" />
              <CardTitle className="text-3xl font-headline text-primary">Welcome to codexair!</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-2">
                Your intelligent code review assistant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-lg text-muted-foreground">
                It looks like you haven't analyzed any pull requests yet.
              </p>
              <p className="text-md">
                Get started by connecting a repository and analyzing your first PR to unlock powerful code insights.
              </p>
              <Button asChild size="lg" className="shadow-md hover:shadow-lg transition-shadow bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/analyze">Start Your First Analysis</Link>
              </Button>
            </CardContent>
             <CardFooter className="justify-center pt-4">
                 <p className="text-xs text-muted-foreground">Empowering developers with AI-driven code intelligence.</p>
             </CardFooter>
          </Card>
        </main>
        <footer className="py-6 border-t bg-background">
          <div className="container text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} codexair.
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold text-foreground font-headline">codexair Dashboard</h1>
            {session.user.role === 'admin' && (
                <Button asChild variant="outline" className="shadow-sm hover:shadow-md transition-shadow">
                    <Link href="/admin">
                        <Shield className="mr-2 h-5 w-5 text-accent" />
                        Go to Admin Panel
                    </Link>
                </Button>
            )}
        </div>
        
        {dashboardData && ( 
          <div className="grid gap-6">
            <AnalyticsOverview overview={dashboardData.overview} />
            <div className="grid md:grid-cols-2 gap-6">
              <RecentReviews reviews={dashboardData.recentAnalyses} />
              <QualityTrends trends={dashboardData.qualityTrends} />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <TopIssues title="Top Security Issues" issues={dashboardData.topSecurityIssues} issueType="security" />
              <TopIssues title="Top Improvement Suggestions" issues={dashboardData.topSuggestions} issueType="suggestion" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <SecurityHotspots hotspots={dashboardData.securityHotspots} />
              <TeamMetrics metrics={dashboardData.teamMetrics} />
            </div>
          </div>
        ) }
      </main>
       <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair.
        </div>
      </footer>
    </div>
  );
}
    
