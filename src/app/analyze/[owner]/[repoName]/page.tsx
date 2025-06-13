
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PullRequest as PRType } from '@/types';
import { Github, GitPullRequest, Eye, RefreshCw, CheckCircle, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/layout/navbar'; 
import { Skeleton } from '@/components/ui/skeleton';

interface PullRequestWithAnalysisStatus extends PRType {
  id: number | string; // GitHub PR ID
  html_url?: string;
  created_at: string; 
  updated_at: string; 
  user?: { login: string; avatar_url?: string }; 
  analysisStatus?: 'analyzed' | 'pending' | 'failed' | 'not_started';
  analysisId?: string;
  qualityScore?: number;
}

export default function RepositoryAnalysisPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repoName = params.repoName as string;
  
  const { data: session, status } = useSession();
  const router = useRouter();

  const [pullRequests, setPullRequests] = useState<PullRequestWithAnalysisStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingPR, setAnalyzingPR] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);


  async function fetchPullRequests(showToast = false) {
    if (showToast) setIsRefreshing(true);
    else setLoading(true); 
    setError(null);
    try {
      const response = await fetch(`/api/github/repos/${owner}/${repoName}/pulls`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch PRs: ${response.statusText}`);
      }
      const data = await response.json();
      
      setPullRequests(data.pull_requests || []);
      if (showToast) toast({ title: "Pull Requests Refreshed", description: "Fetched latest pull requests." });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setPullRequests([]); 
      if(showToast) toast({ title: "Refresh Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      if (showToast) setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && owner && repoName) {
      fetchPullRequests();
    }
  }, [status, router, owner, repoName]);

  const handleAnalyzePR = async (pullNumber: number) => {
    if (!owner || !repoName) {
      toast({ title: "Error", description: "Repository details are missing.", variant: "destructive" });
      return;
    }
    setAnalyzingPR(pullNumber);
    // Optimistically update local state to 'pending'
    setPullRequests(prevPRs => 
      prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'pending' } : pr)
    );

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repoName, pullNumber }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        // Revert status if API call failed
        setPullRequests(prevPRs => 
          prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'not_started' } : pr) 
        );
        throw new Error(errorData.details || errorData.error || 'Failed to start analysis');
      }
      const result = await response.json();
      toast({ title: "Analysis Started", description: `Analysis for PR #${pullNumber} is in progress. Result page will open.` });
      // Update status to analyzed and store analysisId
      setPullRequests(prevPRs => 
        prevPRs.map(pr => pr.number === pullNumber ? { 
            ...pr, 
            analysisStatus: 'analyzed', 
            analysisId: result.analysis._id, 
            qualityScore: result.analysis.qualityScore 
        } : pr)
      );
      router.push(`/analyze/${owner}/${repoName}/${pullNumber}/${result.analysis._id}`);
    } catch (err: any) {
      setError(err.message); 
      toast({ title: "Analysis Error", description: err.message, variant: "destructive" });
       // Revert status if any error during process
      setPullRequests(prevPRs => 
        prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'not_started' } : pr)
      );
    } finally {
      setAnalyzingPR(null);
    }
  };
  
  const getStatusBadgeClasses = (prState: string) => {
    switch (prState.toLowerCase()) {
      case 'open': return 'bg-green-100 text-green-700 border-green-400';
      case 'closed': return 'bg-red-100 text-red-700 border-red-400';
      case 'merged': return 'bg-purple-100 text-purple-700 border-purple-400';
      default: return 'border-muted-foreground';
    }
  }

  const getAnalysisStatusContent = (pr: PullRequestWithAnalysisStatus) => {
    switch (pr.analysisStatus) {
      case 'analyzed':
        return (
          <span className="flex items-center gap-1 text-green-600" title={`Quality Score: ${pr.qualityScore?.toFixed(1) ?? 'N/A'}`}>
            <CheckCircle className="h-4 w-4" /> Analysis complete
          </span>
        );
      case 'pending':
        return <span className="flex items-center gap-1 text-amber-600"><Clock className="h-4 w-4 animate-spin-slow" /> Analysis pending...</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-destructive"><ShieldAlert className="h-4 w-4" /> Analysis failed</span>;
      default: // not_started
        return <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" /> Not analyzed</span>;
    }
  };


  if (status === 'loading' ) {
     return <div className="flex flex-col min-h-screen"><Navbar /><div className="flex-1 flex items-center justify-center">Loading session...</div></div>;
  }
  if (!session) return null;


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="text-3xl font-bold font-headline flex items-center gap-2">
                    <GitPullRequest className="h-8 w-8 text-primary" /> 
                    Pull Requests for {owner}/{repoName}
                    </CardTitle>
                    <CardDescription>Select a pull request to analyze or view existing analysis. Only open PRs can be analyzed.</CardDescription>
                </div>
                <Button variant="outline" className="mt-4 sm:mt-0" onClick={() => fetchPullRequests(true)} disabled={isRefreshing || loading || analyzingPR !== null}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing && 'animate-spin'}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh PRs'}
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !isRefreshing && !pullRequests.length ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <SkeletonPRCard key={i} />)}
              </div>
            ) : error ? (
              <p className="text-destructive text-center py-8">{error}</p>
            ) : pullRequests.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No open pull requests found for this repository. Try refreshing or check GitHub.</p>
            ) : (
              <div className="space-y-4">
                {pullRequests.map(pr => (
                  <Card key={pr.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                        <CardTitle className="text-xl hover:text-primary transition-colors">
                           <Link href={pr.html_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2">
                            <Github className="h-4 w-4 mt-1 opacity-70 flex-shrink-0"/>
                            <span>#{pr.number}: {pr.title}</span>
                           </Link>
                        </CardTitle>
                        <Badge variant={pr.state.toLowerCase() === 'open' ? 'default' : 'destructive'} className={getStatusBadgeClasses(pr.state)}>
                          {pr.state}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 text-xs">
                        Opened by <span className="font-medium">{pr.user?.login || pr.author?.login}</span>{' '}
                        {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">{pr.body || 'No description provided.'}</p>
                    </CardContent>
                    <CardFooter className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-2">
                      <div className="text-xs text-muted-foreground">
                        {getAnalysisStatusContent(pr)}
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                        {pr.analysisStatus === 'analyzed' && pr.analysisId ? (
                          <Button asChild variant="outline" className="w-full sm:w-auto">
                            <Link href={`/analyze/${owner}/${repoName}/${pr.number}/${pr.analysisId}`}>
                              <Eye className="mr-2 h-4 w-4" /> View Analysis
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleAnalyzePR(pr.number)}
                            disabled={analyzingPR === pr.number || pr.state.toLowerCase() !== 'open' || pr.analysisStatus === 'pending'}
                            title={pr.state.toLowerCase() !== 'open' ? "Can only analyze open PRs" : (pr.analysisStatus === 'pending' ? "Analysis in progress..." : `Analyze PR #${pr.number}`)}
                            className="w-full sm:w-auto"
                          >
                            {analyzingPR === pr.number || pr.analysisStatus === 'pending' ? (
                              <><Clock className="mr-2 h-4 w-4 animate-spin-slow" /> Analyzing...</>
                            ) : (
                              <><GitPullRequest className="mr-2 h-4 w-4" /> Analyze PR</>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
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

function SkeletonPRCard() {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-2">
            <div className="space-y-2 w-3/4">
              <Skeleton className="h-6 w-full " /> 
              <Skeleton className="h-4 w-1/2" /> 
            </div>
            <Skeleton className="h-6 w-16 rounded-full" /> 
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-10 w-32" />
        </CardFooter>
      </Card>
    )
}

