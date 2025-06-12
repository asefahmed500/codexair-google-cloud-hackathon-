'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PullRequest as PRType, CodeAnalysis } from '@/types';
import { Github, GitPullRequest, CheckCircle, XCircle, Clock, BarChartBig, ChevronDown, LogOut, UserCircle, Settings, Eye, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface PullRequestWithAnalysisStatus extends PRType {
  analysisStatus?: 'analyzed' | 'pending' | 'failed' | 'not_started';
  analysisId?: string;
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


  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && owner && repoName) {
      fetchPullRequests();
    }
  }, [status, router, owner, repoName]);

  async function fetchPullRequests(showToast = false) {
    setLoading(true);
    setError(null);
    try {
      // First, fetch PRs from GitHub
      const githubRes = await fetch(`/api/github/repos/${owner}/${repoName}/pulls`);
      if (!githubRes.ok) throw new Error(`Failed to fetch PRs from GitHub: ${githubRes.statusText}`);
      const githubPRsData = await githubRes.json();
      
      // Then, fetch PRs with analysis status from our DB
      const dbRes = await fetch(`/api/repositories/${owner}/${repoName}/pulls`);
      if (!dbRes.ok) throw new Error(`Failed to fetch PRs from DB: ${dbRes.statusText}`);
      const dbPRsData = await dbRes.json();

      // Merge data: Use GitHub PRs as source of truth, augment with analysis status
      const mergedPRs = githubPRsData.pull_requests.map((ghPr: any) => {
        const dbPr = dbPRsData.pullRequests.find((pr: PRType) => pr.number === ghPr.number);
        return {
          ...ghPr, // Spread GitHub PR data
          _id: dbPr?._id, // Use DB _id if available
          githubId: ghPr.id, // Ensure githubId is present (it's GitHub's global PR ID)
          author: { login: ghPr.user.login, avatar: ghPr.user.avatar_url }, // Normalize author
          analysisStatus: dbPr?.analysis ? 'analyzed' : 'not_started',
          analysisId: dbPr?.analysis?._id || dbPr?.analysis, // analysis can be populated or just ID
        };
      });
      
      setPullRequests(mergedPRs);
      if (showToast) toast({ title: "Pull Requests Refreshed", description: "Fetched latest pull requests." });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const handleAnalyzePR = async (pullNumber: number) => {
    if (!owner || !repoName) {
      toast({ title: "Error", description: "Repository details are missing.", variant: "destructive" });
      return;
    }
    setAnalyzingPR(pullNumber);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repoName, pullNumber }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to start analysis');
      }
      const result = await response.json();
      toast({ title: "Analysis Started", description: `Analysis for PR #${pullNumber} is in progress.` });
      // Navigate to the analysis details page
      router.push(`/analyze/${owner}/${repoName}/${pullNumber}/${result.analysis._id}`);
      // Or update status locally and re-fetch if staying on this page
      // fetchPullRequests(); 
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Analysis Error", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzingPR(null);
    }
  };
  
  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading session...</div>;
  }
  if (!session) return null;


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground font-headline">codexair</span>
          </Link>
          <div className="flex items-center gap-4">
             <Button variant="ghost" onClick={() => fetchPullRequests(true)} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading && 'animate-spin'}`} />
              Refresh PRs
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 py-1 h-auto">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user?.image || undefined} alt={session.user?.name || 'User'} />
                    <AvatarFallback>{session.user?.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                   <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{session.user?.name || 'My Account'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                    <BarChartBig className="mr-2 h-4 w-4" /> Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/analyze')}>
                    <Github className="mr-2 h-4 w-4" /> Analyze Another Repo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold font-headline flex items-center gap-2">
              <GitPullRequest className="h-8 w-8 text-primary" /> 
              Pull Requests for {owner}/{repoName}
            </CardTitle>
            <CardDescription>Select a pull request to analyze or view existing analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <SkeletonPRCard key={i} />)}
              </div>
            ) : error ? (
              <p className="text-destructive text-center">{error}</p>
            ) : pullRequests.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No open pull requests found for this repository.</p>
            ) : (
              <div className="space-y-4">
                {pullRequests.map(pr => (
                  <Card key={pr.id || pr._id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl hover:text-primary transition-colors">
                           <Link href={pr.html_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            #{pr.number}: {pr.title} <Github className="h-4 w-4 opacity-70"/>
                           </Link>
                        </CardTitle>
                        <CardDescription className="mt-1 text-xs">
                          Opened by <span className="font-medium">{pr.author?.login}</span>{' '}
                          {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                        </CardDescription>
                      </div>
                      <Badge variant={pr.state === 'open' ? 'default' : 'secondary'} className={pr.state === 'open' ? 'bg-green-500/20 text-green-700 border-green-400' : 'bg-red-500/20 text-red-700 border-red-400'}>
                        {pr.state}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{pr.body || 'No description provided.'}</p>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                      {pr.analysisStatus === 'analyzed' && pr.analysisId ? (
                        <Button asChild variant="outline">
                          <Link href={`/analyze/${owner}/${repoName}/${pr.number}/${pr.analysisId}`}>
                            <Eye className="mr-2 h-4 w-4" /> View Analysis
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleAnalyzePR(pr.number)}
                          disabled={analyzingPR === pr.number || pr.state !== 'open'}
                          title={pr.state !== 'open' ? "Can only analyze open PRs" : ""}
                        >
                          {analyzingPR === pr.number ? (
                            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                          ) : (
                            <><GitPullRequest className="mr-2 h-4 w-4" /> Analyze PR</>
                          )}
                        </Button>
                      )}
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
      <Card>
        <CardHeader>
          <div className="h-6 bg-muted rounded w-3/4 mb-2 animate-pulse"></div>
          <div className="h-4 bg-muted rounded w-1/4 animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="h-4 bg-muted rounded w-full mb-1 animate-pulse"></div>
          <div className="h-4 bg-muted rounded w-5/6 animate-pulse"></div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <div className="h-10 bg-muted rounded w-32 animate-pulse"></div>
        </CardFooter>
      </Card>
    )
}

// New API route for fetching PRs (both GitHub and DB status)
// This would go in a new file: src/app/api/github/repos/[owner]/[repoName]/pulls/route.ts
// For this exercise, I'm putting a note here that this API endpoint is needed by the above page.
// The page currently calls /api/github/repos/... and /api/repositories/...
// These would need to be implemented.
// For now, the fetchPullRequests function in the page will need adjustment to point to actual API endpoints.
// I will create placeholder API routes for this.
