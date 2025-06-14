
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Github, GitPullRequest, Eye, RefreshCw, CheckCircle, XCircle, Clock, ShieldAlert, GitBranch, User, ExternalLink, CompareArrows } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/layout/navbar'; 
import { Skeleton } from '@/components/ui/skeleton';

interface DisplayablePullRequest {
  id: number | string; // GitHub ID
  _id?: string; // Our DB's PullRequest document _id
  number: number;
  title: string;
  html_url?: string;
  created_at: string;
  updated_at: string; // Added for "Last Updated" column
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
  const [analyzingPR, setAnalyzingPR] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPRsForCompare, setSelectedPRsForCompare] = useState<number[]>([]);


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
      
      const result = await response.json();

      if (!response.ok) {
        setPullRequests(prevPRs => 
          prevPRs.map(pr => pr.number === pullNumber ? { ...pr, analysisStatus: 'failed' } : pr) 
        );
        throw new Error(result.details || result.error || 'Failed to start analysis');
      }
      
      toast({ title: "Analysis Complete", description: `Analysis for PR #${pullNumber} is complete. Redirecting...` });
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

  const togglePRForCompare = (prNumber: number) => {
    setSelectedPRsForCompare(prevSelected => {
      if (prevSelected.includes(prNumber)) {
        return prevSelected.filter(num => num !== prNumber);
      } else {
        if (prevSelected.length < 2) {
          return [...prevSelected, prNumber];
        } else {
          // If already 2 selected, replace the first one with the new one
          toast({ title: "Limit Reached", description: "You can select up to 2 PRs for comparison. Replacing the first selection.", variant: "default" });
          return [prevSelected[1], prNumber];
        }
      }
    });
  };

  const handleComparePRs = () => {
    if (selectedPRsForCompare.length === 2) {
      router.push(`/analyze/${owner}/${repoName}/compare/${selectedPRsForCompare[0]}/vs/${selectedPRsForCompare[1]}`);
    } else {
      toast({ title: "Selection Needed", description: "Please select exactly two pull requests to compare.", variant: "destructive" });
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
          <div className="flex items-center gap-1 text-xs sm:text-sm">
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
        return <span className="flex items-center gap-1 text-amber-500 text-xs sm:text-sm"><Clock className="h-4 w-4 animate-spin-slow" /> Pending...</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-destructive text-xs sm:text-sm"><ShieldAlert className="h-4 w-4" /> Failed</span>;
      default: // not_started or undefined
        return <span className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm"><XCircle className="h-4 w-4" /> Not Analyzed</span>;
    }
  };

  if (status === 'loading') {
     return <div className="flex flex-col min-h-screen"><Navbar /><div className="flex-1 flex items-center justify-center">Loading session...</div></div>;
  }
  if (!session) return null;

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-headline flex items-center gap-2">
                        <GitPullRequest className="h-7 w-7 sm:h-8 sm:w-8 text-primary" /> 
                        Pull Requests: {owner}/{repoName}
                    </h1>
                    <Button variant="link" onClick={() => router.push('/analyze')} className="p-0 h-auto text-sm text-primary hover:underline">
                        &larr; Back to Repositories
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => fetchPullRequestsData(true)} disabled={isRefreshing || loading || analyzingPR !== null}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing && 'animate-spin'}`} />
                      {isRefreshing ? 'Refreshing...' : 'Refresh PRs'}
                  </Button>
                  <Button 
                    onClick={handleComparePRs} 
                    disabled={selectedPRsForCompare.length !== 2 || loading || isRefreshing}
                    className="w-full sm:w-auto"
                    title={selectedPRsForCompare.length !== 2 ? "Select two PRs to compare" : "Compare selected PRs"}
                  >
                    <CompareArrows className="mr-2 h-4 w-4" /> Compare ({selectedPRsForCompare.length}/2)
                  </Button>
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !isRefreshing && !pullRequests.length ? (
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    {[...Array(5)].map((_, i) => <SkeletonPRRow key={i} />)}
                </div>
            ) : error ? (
                <p className="text-destructive text-center py-8">{error}</p>
            ) : pullRequests.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No open pull requests found for this repository. Try refreshing or check GitHub.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead> {/* Checkbox column */}
                      <TableHead>PR</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pullRequests.map(pr => (
                      <TableRow key={pr.id} className={selectedPRsForCompare.includes(pr.number) ? 'bg-primary/10' : ''}>
                        <TableCell>
                          <input 
                            type="checkbox"
                            className="form-checkbox h-4 w-4 text-primary border-muted-foreground rounded focus:ring-primary"
                            checked={selectedPRsForCompare.includes(pr.number)}
                            onChange={() => togglePRForCompare(pr.number)}
                            disabled={selectedPRsForCompare.length >= 2 && !selectedPRsForCompare.includes(pr.number)}
                            title={selectedPRsForCompare.length >= 2 && !selectedPRsForCompare.includes(pr.number) ? "Unselect another PR first to select this one" : `Select PR #${pr.number} for comparison`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link href={pr.html_url || '#'} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary flex items-center gap-1.5" title={pr.title}>
                            #{pr.number} <span className="truncate max-w-[200px] sm:max-w-xs">{pr.title}</span> <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                           <span className="flex items-center gap-1" title={pr.branch}><GitBranch className="h-3.5 w-3.5"/> {pr.branch || 'N/A'}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                           <span className="flex items-center gap-1" title={pr.user?.login || pr.author?.login}><User className="h-3.5 w-3.5"/> {pr.user?.login || pr.author?.login || 'N/A'}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(pr.updated_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>{getAnalysisStatusContent(pr)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          {pr.analysisStatus === 'analyzed' && pr.analysisId ? (
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/analyze/${owner}/${repoName}/${pr.number}/${pr.analysisId}`}>
                                <Eye className="mr-1 h-4 w-4" /> View
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleAnalyzePR(pr.number)}
                              disabled={analyzingPR === pr.number || pr.state.toLowerCase() !== 'open' || pr.analysisStatus === 'pending' || pr.analysisStatus === 'failed'}
                              title={pr.state.toLowerCase() !== 'open' ? "Can only analyze open PRs" : (pr.analysisStatus === 'pending' ? "Analysis in progress..." : (pr.analysisStatus === 'failed' ? "Analysis failed, try again?" : `Analyze PR #${pr.number}`))}
                              size="sm"
                              variant={pr.analysisStatus === 'failed' ? 'destructive' : 'default'}
                            >
                              {analyzingPR === pr.number || pr.analysisStatus === 'pending' ? (
                                <><Clock className="mr-1 h-4 w-4 animate-spin-slow" /> Analyzing...</>
                              ) : pr.analysisStatus === 'failed' ? (
                                <><RefreshCw className="mr-1 h-4 w-4" /> Retry</>
                              ) : (
                                <><GitPullRequest className="mr-1 h-4 w-4" /> Analyze</>
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
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

function SkeletonPRRow() {
  return (
    <div className="flex items-center space-x-4 p-4 border-b">
      <Skeleton className="h-4 w-4" /> {/* Checkbox Skeleton */}
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-24 hidden sm:block" /> {/* Branch Skeleton */}
      <Skeleton className="h-4 w-20 hidden md:block" /> {/* Author Skeleton */}
      <Skeleton className="h-4 w-24 hidden lg:block" /> {/* Last Updated Skeleton */}
      <Skeleton className="h-4 w-28" /> {/* Status Skeleton */}
      <Skeleton className="h-8 w-20" /> {/* Actions Skeleton */}
    </div>
  )
}

    