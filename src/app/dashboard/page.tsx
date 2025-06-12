
'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import AnalyticsOverview from '@/components/dashboard/analytics-overview';
import RecentReviews from '@/components/dashboard/recent-reviews';
import QualityTrends from '@/components/dashboard/quality-trends';
import { DashboardData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Navbar from '@/components/layout/navbar'; // Import the new Navbar

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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch dashboard data');
      }
      const data: DashboardData = await response.json();
      setDashboardData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  if (status === 'loading' || (loading && !dashboardData && !error)) { // Adjusted loading condition
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar /> {/* Use Navbar skeleton if Navbar handles its own loading state */}
        <main className="flex-1 container py-8">
          <div className="grid gap-6 animate-pulse">
            <div className="h-9 bg-muted rounded w-48 mb-8"></div> {/* Title skeleton */}
            <div className="h-40 bg-muted rounded-lg"></div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="h-80 bg-muted rounded-lg"></div>
              <div className="h-80 bg-muted rounded-lg"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container py-8 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{error}</p>
              <Button onClick={fetchDashboardData} className="mt-4">Try Again</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  
  if (!session) return null; // Should be redirected by useEffect

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> {/* Use the new Navbar */}
      <main className="flex-1 container py-8">
        <h1 className="text-3xl font-bold mb-8 text-foreground font-headline">Dashboard</h1>
        {dashboardData && (
          <div className="grid gap-6">
            <AnalyticsOverview overview={dashboardData.overview} />
            <div className="grid md:grid-cols-2 gap-6">
              <RecentReviews reviews={dashboardData.recentAnalyses} />
              <QualityTrends trends={dashboardData.qualityTrends} />
            </div>
          </div>
        )}
         {!dashboardData && !loading && !error && ( // This condition might need adjustment based on actual loading flow
            <Card>
                <CardHeader><CardTitle>No Data Yet</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-4">It looks like you haven't analyzed any repositories or pull requests yet.</p>
                    <Button asChild>
                        <Link href="/analyze">Start Your First Analysis</Link>
                    </Button>
                </CardContent>
            </Card>
        )}
      </main>
       <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair. Built with passion.
        </div>
      </footer>
    </div>
  );
}
