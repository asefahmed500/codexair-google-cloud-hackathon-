
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, GitPullRequest, Eye, RefreshCw, CheckCircle, XCircle, Clock, ShieldAlert, GitBranch, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/layout/navbar'; 
import { Skeleton } from '@/components/ui/skeleton';

// This interface should match the structure returned by the API endpoint
interface DisplayablePullRequest {
  id: number | string; // GitHub ID
  _id?: string; // Our DB's PullRequest document _id
  number: number;
  title: string;
  html_url?: string;
  created_at: string;
  user?: { login: string; avatar_url?: string };
  author?: { login: string; avatar?: string }; // From our DB
  branch?: string; // Source branch name
  state: "open" | "closed" | "merged"; // GitHub PR state
  analysisStatus?: 'analyzed' | 'pending' | 'failed' | 'not_started';
  analysisId?: string;
  qualityScore?: number | null;
}

export default function RepositoryAnalysisPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repoName = params.repoName as string;
  
  const { data: session, status } = useSession();
  const router = useRouter();

  const [pullRequests, setPullRequests] = useState<DisplayablePullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingPR, setAnalyzingPR] = useState<number | null>(null); // Stores the number of the PR being analyzed
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPullRequestsData = useCallback(async (showRefreshToast = false) => {
    if (showRefreshToast) setIsRefreshing(true);
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
      if (showRefreshToast) toast({ title: "Pull Requests Refreshed", description: "Fetched latest pull requests for this repository." });
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setPullRequests([]);
      if (showRefreshToast) toast({ title: "Refresh Error", description: err.message, variant: "destructive" });
    } finally {
      if (showRefreshToast) setIsRefreshing(false);
      else setLoading(false);
    }
  }, [owner, repoName]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && owner && repoName) {
      fetchPullRequestsData();
    }
  }, [status, router, owner, repoName, fetchPullRequestsData]);

  const handleAnalyzePR = async (pullNumber: number) => {
    if (!owner || !repoName) {
      toast({ title: "Error", description: "Repository details are missing.", variant: "destructive" });
      return;
    }
    setAnalyzingPR(pullNumber);
    setPullRequests(prevPRs => 
      prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'pending' } : pr)
    );

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repoName, pullNumber }),
      });
      
      const result = await response.json(); // Always try to parse JSON

      if (!response.ok) {
        setPullRequests(prevPRs => 
          prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'failed' } : pr) 
        );
        throw new Error(result.details || result.error || 'Failed to start analysis');
      }
      
      toast({ title: "Analysis Complete", description: `Analysis for PR #${pullNumber} is complete. Redirecting...` });
      // Update the specific PR in the list with new analysis data
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
      setPullRequests(prevPRs => 
        prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'failed' } : pr)
      );
    } finally {
      setAnalyzingPR(null);
    }
  };
  
  const getGHStateBadgeClasses = (prState: string) => {
    switch (prState.toLowerCase()) {
      case 'open': return 'bg-green-100 text-green-700 border-green-400 hover:bg-green-200';
      case 'closed': return 'bg-red-100 text-red-700 border-red-400 hover:bg-red-200';
      case 'merged': return 'bg-purple-100 text-purple-700 border-purple-400 hover:bg-purple-200';
      default: return 'border-muted-foreground text-muted-foreground';
    }
  };

  const getQualityScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'text-muted-foreground';
    if (score >= 7) return 'text-green-600';
    if (score >= 4) return 'text-amber-600';
    return 'text-destructive';
  };

  const getAnalysisStatusContent = (pr: DisplayablePullRequest) => {
    switch (pr.analysisStatus) {
      case 'analyzed':
        return (
          <div className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-green-600">Analyzed</span>
            {pr.qualityScore !== null && pr.qualityScore !== undefined && (
              <Badge variant="outline" className={`ml-1 font-semibold ${getQualityScoreColor(pr.qualityScore)}`}>
                QS: {pr.qualityScore.toFixed(1)}
              </Badge>
            )}
          </div>
        );
      case 'pending':
        return <span className="flex items-center gap-1 text-amber-500"><Clock className="h-4 w-4 animate-spin-slow" /> Pending...</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-destructive"><ShieldAlert className="h-4 w-4" /> Failed</span>;
      default: // not_started or undefined
        return <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" /> Not Analyzed</span>;
    }
  };

  if (status === 'loading' ) {
     return <div className="flex flex-col min-h-screen"><Navbar /><div className="flex-1 flex items-center justify-center">Loading session...</div></div>;
  }
  if (!session) return null;

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
                 <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-headline flex items-center gap-2">
                    <GitPullRequest className="h-7 w-7 sm:h-8 sm:w-8 text-primary" /> 
                    Pull Requests: {owner}/{repoName}
                </h1>
                <Button variant="link" onClick={() => router.push('/analyze')} className="p-0 h-auto text-sm text-primary hover:underline">
                    &larr; Back to Repositories
                </Button>
            </div>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => fetchPullRequestsData(true)} disabled={isRefreshing || loading || analyzingPR !== null}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing && 'animate-spin'}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh PRs'}
            </Button>
        </div>

        {loading && !isRefreshing && !pullRequests.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => <SkeletonPRCard key={i} />)}
            </div>
        ) : error ? (
            <p className="text-destructive text-center py-8">{error}</p>
        ) : pullRequests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No open pull requests found for this repository. Try refreshing or check GitHub.</p>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pullRequests.map(pr => (
                <Card key={pr.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-lg sm:text-xl hover:text-primary transition-colors flex-grow">
                        <Link href={pr.html_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5">
                        <Github className="h-4 w-4 mt-1 opacity-70 flex-shrink-0"/>
                        <span className="truncate" title={`#${pr.number}: ${pr.title}`}>#{pr.number}: {pr.title}</span>
                        </Link>
                    </CardTitle>
                    <Badge variant="outline" className={`whitespace-nowrap text-xs ${getGHStateBadgeClasses(pr.state)}`}>
                        {pr.state}
                    </Badge>
                    </div>
                    <CardDescription className="mt-1 text-xs space-y-0.5">
                        <span className="flex items-center gap-1">
                           <User className="h-3 w-3" /> Author: {pr.user?.login || pr.author?.login || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" /> Branch: {pr.branch || 'N/A'}
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 pb-3 text-xs text-muted-foreground flex-grow">
                    Opened {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-2 border-t pt-3">
                    <div className="text-xs w-full">
                        {getAnalysisStatusContent(pr)}
                    </div>
                    <div className="flex gap-2 w-full justify-end">
                    {pr.analysisStatus === 'analyzed' && pr.analysisId ? (
                        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                        <Link href={`/analyze/${owner}/${repoName}/${pr.number}/${pr.analysisId}`}>
                            <Eye className="mr-2 h-4 w-4" /> View Analysis
                        </Link>
                        </Button>
                    ) : (
                        <Button
                        onClick={() => handleAnalyzePR(pr.number)}
                        disabled={analyzingPR === pr.number || pr.state.toLowerCase() !== 'open' || pr.analysisStatus === 'pending' || pr.analysisStatus === 'failed'}
                        title={pr.state.toLowerCase() !== 'open' ? "Can only analyze open PRs" : (pr.analysisStatus === 'pending' ? "Analysis in progress..." : (pr.analysisStatus === 'failed' ? "Analysis failed, try again?" : `Analyze PR #${pr.number}`))}
                        size="sm"
                        variant={pr.analysisStatus === 'failed' ? 'destructive' : 'default'}
                        className="w-full sm:w-auto"
                        >
                        {analyzingPR === pr.number || pr.analysisStatus === 'pending' ? (
                            <><Clock className="mr-2 h-4 w-4 animate-spin-slow" /> Analyzing...</>
                        ) : pr.analysisStatus === 'failed' ? (
                            <><RefreshCw className="mr-2 h-4 w-4" /> Retry Analysis</>
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
        </main>
        <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
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
            <Skeleton className="h-6 w-16 rounded-md" /> 
          </div>
           <div className="space-y-1 mt-1">
              <Skeleton className="h-3 w-20" /> 
              <Skeleton className="h-3 w-24" /> 
            </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3">
          <Skeleton className="h-3 w-28" />
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 border-t pt-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
        </CardFooter>
      </Card>
    )
}
