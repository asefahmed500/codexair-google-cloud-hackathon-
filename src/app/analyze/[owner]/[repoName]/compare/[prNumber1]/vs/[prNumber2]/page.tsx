
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/layout/navbar';
import { PullRequest as PRType, CodeAnalysis, SecurityIssue, Suggestion, CodeFile, Repository as RepoType } from '@/types';
import { ArrowLeftRight, Github, AlertTriangle, Lightbulb, FileText, CalendarDays, User, CheckCircle, XCircle, FileWarning, RefreshCw, GitPullRequest, GitBranch } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface FullPRData {
  pullRequest: PRType & { repositoryId: string | RepoType }; // Ensure repositoryId is present
  analysis?: CodeAnalysis;
}

export default function PRComparisonPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const owner = params.owner as string;
  const repoName = params.repoName as string;
  const prNumber1 = params.prNumber1 as string;
  const prNumber2 = params.prNumber2 as string;

  const [prData1, setPrData1] = useState<FullPRData | null>(null);
  const [prData2, setPrData2] = useState<FullPRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPRData = async (prNumber: string): Promise<FullPRData | null> => {
    try {
      const res = await fetch(`/api/pullrequests/details/${owner}/${repoName}/${prNumber}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(`Failed to fetch PR #${prNumber}: ${errData.error || res.statusText}`);
      }
      const data = await res.json();
      return { 
        pullRequest: data.pullRequest, 
        analysis: data.pullRequest.analysis || undefined
      };
    } catch (e: any) {
      console.error(`Error fetching PR #${prNumber}:`, e);
      setError(prev => `${prev ? prev + '; ' : ''}Error fetching PR #${prNumber}: ${e.message}`);
      return null;
    }
  };
  
  const refreshSpecificPRData = async (prNum: string, isPr1: boolean) => {
    const data = await fetchPRData(prNum);
    if (data) {
      if (isPr1) setPrData1(data);
      else setPrData2(data);
      toast({title: `PR #${prNum} Data Refreshed`, description: "Latest analysis status updated."});
    } else {
      toast({title: "Refresh Failed", description: `Could not refresh data for PR #${prNum}.`, variant: "destructive"});
    }
  }


  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && owner && repoName && prNumber1 && prNumber2) {
      setLoading(true);
      setError(null);
      Promise.all([fetchPRData(prNumber1), fetchPRData(prNumber2)])
        .then(([data1, data2]) => {
          if (data1) setPrData1(data1); else setError(prev => `${prev ? prev + '; ' : ''}Could not load data for PR #${prNumber1}.`);
          if (data2) setPrData2(data2); else setError(prev => `${prev ? prev + '; ' : ''}Could not load data for PR #${prNumber2}.`);
        })
        .finally(() => setLoading(false));
    }
  }, [status, router, owner, repoName, prNumber1, prNumber2]);

  if (status === 'loading' || loading) {
    return <PRComparisonLoadingSkeleton owner={owner} repoName={repoName} prNumber1={prNumber1} prNumber2={prNumber2} />;
  }

  if (error || !prData1 || !prData2) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container py-8">
          <Button variant="outline" onClick={() => router.push(`/analyze/${owner}/${repoName}`)} className="mb-6">Back to {owner}/{repoName}</Button>
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Comparison Data</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-line">
                {error || "Could not load data for one or both pull requests. Please ensure they exist and you have access."}
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  
  const getSeverityBadgeVariant = (severity: SecurityIssue['severity']) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive'; 
      case 'medium': return 'default'; 
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };
  
  const getPriorityBadgeVariant = (priority: Suggestion['priority']) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <Button variant="outline" onClick={() => router.push(`/analyze/${owner}/${repoName}`)} className="mb-6">
          Back to {owner}/{repoName}
        </Button>

        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl md:text-4xl font-bold font-headline flex items-center gap-3">
              <ArrowLeftRight className="h-8 w-8 text-primary" />
              Comparing Pull Requests in {owner}/{repoName}
            </CardTitle>
            <CardDescription>
              Side-by-side details for PR #{prNumber1} and PR #{prNumber2}.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <PRDetailsColumn prData={prData1} owner={owner} repoName={repoName} prNumber={prNumber1} getSeverityBadgeVariant={getSeverityBadgeVariant} getPriorityBadgeVariant={getPriorityBadgeVariant} onAnalysisComplete={() => refreshSpecificPRData(prNumber1, true)} />
          <PRDetailsColumn prData={prData2} owner={owner} repoName={repoName} prNumber={prNumber2} getSeverityBadgeVariant={getSeverityBadgeVariant} getPriorityBadgeVariant={getPriorityBadgeVariant} onAnalysisComplete={() => refreshSpecificPRData(prNumber2, false)} />
        </div>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair.
        </div>
      </footer>
    </div>
  );
}

interface PRDetailsColumnProps {
  prData: FullPRData;
  owner: string;
  repoName: string;
  prNumber: string;
  getSeverityBadgeVariant: (severity: SecurityIssue['severity']) => "default" | "destructive" | "secondary" | "outline" | null | undefined;
  getPriorityBadgeVariant: (priority: Suggestion['priority']) => "default" | "destructive" | "secondary" | "outline" | null | undefined;
  onAnalysisComplete: () => void;
}

function PRDetailsColumn({ prData, owner, repoName, prNumber, getSeverityBadgeVariant, getPriorityBadgeVariant, onAnalysisComplete }: PRDetailsColumnProps) {
  const { pullRequest, analysis } = prData;
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyzePR = async (prNumToAnalyze: number) => {
    setIsAnalyzing(true);
    toast({ title: "Initiating Analysis...", description: `Analysis for PR #${prNumToAnalyze} will start.`});
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repoName, pullNumber: prNumToAnalyze }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to start analysis');
      }
      // const result = await response.json(); // Not strictly needed here unless we use result.analysis._id
      toast({ title: "Analysis Started", description: `Analysis for PR #${prNumToAnalyze} is in progress. This view will update shortly.` });
      onAnalysisComplete(); // Notify parent to refresh this PR's data
    } catch (err: any) {
      toast({ title: "Analysis Error", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <Card className="flex flex-col h-full shadow-md">
      <CardHeader>
        <div className="flex justify-between items-start">
            <CardTitle className="text-lg md:text-xl font-semibold">
                PR #{prNumber}: <span className="font-normal">{pullRequest.title}</span>
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
                <Link href={`https://github.com/${owner}/${repoName}/pull/${prNumber}`} target="_blank" rel="noopener noreferrer">
                   <Github className="h-3.5 w-3.5 mr-1.5" /> GitHub
                </Link>
            </Button>
        </div>
        <CardDescription className="text-xs flex flex-col gap-1 mt-1">
           <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />By: {pullRequest.author?.login || 'N/A'}</span>
           <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Created: {format(new Date(pullRequest.createdAt), "MMM d, yyyy")}</span>
           {/* Branch name is not explicitly stored in PRType, would require GitHub API call or modification to how PRs are stored if vital here */}
           {/* For now, it's shown on the PR listing page */}
            <span className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                {/* Branch: {pullRequest.branch || 'N/A'}  This field isn't on PRType directly */}
                Lines: <span className="text-green-600">+{pullRequest.files.reduce((sum, f) => sum + f.additions, 0)}</span> / <span className="text-red-600">-{pullRequest.files.reduce((sum, f) => sum + f.deletions, 0)}</span>
            </span>
           <Badge variant={pullRequest.state === 'open' ? 'default' : 'secondary'} className={`w-fit mt-1 ${pullRequest.state === 'open' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
            {pullRequest.state}
           </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-4 text-xs h-auto">
            <TabsTrigger value="overview" className="py-1.5">Overview</TabsTrigger>
            <TabsTrigger value="files" className="py-1.5">Files ({pullRequest.files?.length || 0})</TabsTrigger>
            <TabsTrigger value="security" className="py-1.5">Security ({analysis?.securityIssues?.length || 0})</TabsTrigger>
            <TabsTrigger value="suggestions" className="py-1.5">Suggestions ({analysis?.suggestions?.length || 0})</TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[calc(60vh_-_50px)] md:h-[400px] pr-2"> {/* Adjusted height */}
            <TabsContent value="overview">
              <h4 className="font-semibold mb-2 text-sm">PR Description:</h4>
              {pullRequest.body ? (
                 <ScrollArea className="h-28 text-xs p-2 border rounded-md bg-muted/30">
                    <pre className="whitespace-pre-wrap font-sans">{pullRequest.body}</pre>
                 </ScrollArea>
              ) : <p className="text-xs text-muted-foreground italic">No description provided.</p>}

              {analysis ? (
                <div className="mt-4 space-y-3">
                  <h4 className="font-semibold text-sm">Analysis Summary:</h4>
                  <div className="text-xs space-y-1">
                    <p><strong>Quality Score:</strong> {analysis.qualityScore?.toFixed(1)}/10</p>
                    <p><strong>Complexity:</strong> {analysis.complexity?.toFixed(1)}</p>
                    <p><strong>Maintainability:</strong> {analysis.maintainability?.toFixed(1)}</p>
                    <p><strong>Critical/High Security Issues:</strong> {(analysis.securityIssues || []).filter(si => si.severity === 'critical' || si.severity === 'high').length}</p>
                  </div>
                  <h4 className="font-semibold text-sm mt-3">AI Insights:</h4>
                  <ScrollArea className="h-28 text-xs p-2 border rounded-md bg-muted/30">
                      <pre className="whitespace-pre-wrap font-sans">{analysis.aiInsights || "No AI insights generated."}</pre>
                  </ScrollArea>
                   <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                        <Link href={`/analyze/${owner}/${repoName}/${prNumber}/${analysis._id}`}>View Full Analysis</Link>
                   </Button>
                </div>
              ) : (
                <Card className="mt-4 p-4 border-dashed text-center bg-muted/20">
                  <CardHeader className="p-0 mb-2">
                     <FileWarning className="mx-auto h-10 w-10 text-muted-foreground"/>
                     <CardTitle className="text-md font-medium mt-1">No Analysis Data</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <p className="text-xs text-muted-foreground mb-3">This pull request has not been analyzed yet.</p>
                    {pullRequest.state === 'open' && (
                       <Button 
                          size="sm" 
                          variant="default" 
                          onClick={() => handleAnalyzePR(pullRequest.number)}
                          disabled={isAnalyzing}
                        >
                          {isAnalyzing ? (
                            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                          ) : (
                            <><GitPullRequest className="mr-2 h-4 w-4" />Analyze PR #{pullRequest.number}</>
                          )}
                        </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="files">
              {pullRequest.files?.length > 0 ? (
                <ul className="space-y-2">
                  {pullRequest.files.map((file: CodeFile, index: number) => (
                    <li key={index} className="text-xs p-2 border rounded-md bg-muted/30">
                      <p className="font-medium truncate text-foreground" title={file.filename}>{file.filename}</p>
                      <div className="flex justify-between items-center text-muted-foreground mt-0.5">
                        <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">{file.status}</Badge>
                        <div>
                          <span className="text-green-600">+{file.additions}</span> / <span className="text-red-600">-{file.deletions}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground italic">No files listed for this PR.</p>}
            </TabsContent>

            <TabsContent value="security">
              {analysis?.securityIssues?.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {analysis.securityIssues.map((issue, index) => (
                    <AccordionItem value={`sec-issue-${index}-${prNumber}`} key={index} className="border-b-0 mb-1.5">
                      <AccordionTrigger className="text-xs p-2 bg-muted/30 hover:bg-muted/50 rounded-md data-[state=open]:rounded-b-none">
                        <div className="flex items-center justify-between w-full">
                            <span className="font-medium text-left truncate pr-2" title={issue.title}>{issue.title}</span>
                            <Badge variant={getSeverityBadgeVariant(issue.severity)} className="text-[10px] px-1.5 py-0">{issue.severity}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="text-xs p-2.5 bg-muted/20 rounded-b-md border-t-0">
                        <p className="mb-1"><strong className="text-foreground">Description:</strong> {issue.description}</p>
                        <p className="mb-1"><strong className="text-foreground">File:</strong> {issue.file} {issue.line && `(Line: ${issue.line})`}</p>
                        <p className="mb-1"><strong className="text-foreground">Suggestion:</strong> {issue.suggestion}</p>
                        {issue.cwe && <p><strong className="text-foreground">CWE:</strong> {issue.cwe}</p>}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : <p className="text-xs text-muted-foreground italic">No security issues found in analysis.</p>}
            </TabsContent>

            <TabsContent value="suggestions">
              {analysis?.suggestions?.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {analysis.suggestions.map((suggestion, index) => (
                    <AccordionItem value={`sug-issue-${index}-${prNumber}`} key={index} className="border-b-0 mb-1.5">
                      <AccordionTrigger className="text-xs p-2 bg-muted/30 hover:bg-muted/50 rounded-md data-[state=open]:rounded-b-none">
                        <div className="flex items-center justify-between w-full">
                            <span className="font-medium text-left truncate pr-2" title={suggestion.title}>{suggestion.title}</span>
                            <Badge variant={getPriorityBadgeVariant(suggestion.priority)} className="text-[10px] px-1.5 py-0">{suggestion.priority}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="text-xs p-2.5 bg-muted/20 rounded-b-md">
                        <p className="mb-1"><strong className="text-foreground">Type:</strong> <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">{suggestion.type}</Badge></p>
                        <p className="mb-1"><strong className="text-foreground">Description:</strong> {suggestion.description}</p>
                        <p className="mb-1"><strong className="text-foreground">File:</strong> {suggestion.file} {suggestion.line && `(Line: ${suggestion.line})`}</p>
                        {suggestion.codeExample && (
                            <>
                            <p className="text-xs font-medium text-foreground mb-0.5">Code Example:</p>
                            <ScrollArea className="max-h-32 w-full rounded-md border bg-background p-1.5 shadow-inner">
                                <pre className="text-[10px] font-code whitespace-pre-wrap">{suggestion.codeExample}</pre>
                            </ScrollArea>
                            </>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : <p className="text-xs text-muted-foreground italic">No improvement suggestions found in analysis.</p>}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PRComparisonLoadingSkeleton({owner, repoName, prNumber1, prNumber2} : {owner?:string, repoName?:string, prNumber1?:string, prNumber2?:string}) {
  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <Skeleton className="h-9 w-48 mb-6" /> {/* Back Button Skeleton */}
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <Skeleton className="h-10 w-3/4 mb-2" /> {/* Page Title */}
            <Skeleton className="h-5 w-1/2" /> {/* Page Description */}
          </CardHeader>
        </Card>
        <div className="grid md:grid-cols-2 gap-6">
          {[prNumber1, prNumber2].map((prNum, idx) => (
            <Card key={idx} className="shadow-md">
              <CardHeader>
                <Skeleton className="h-7 w-2/3 mb-1" /> {/* PR Title in Column */}
                <div className="space-y-1.5 mt-1">
                    <Skeleton className="h-4 w-1/2" /> {/* PR Meta 1 */}
                    <Skeleton className="h-4 w-1/3" /> {/* PR Meta 2 */}
                    <Skeleton className="h-5 w-16 rounded-full" /> {/* Badge Skeleton */}
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-full mb-4" /> {/* Tabs List Skeleton */}
                <div className="space-y-3">
                    <Skeleton className="h-6 w-1/3 mb-1" /> {/* Section Title Skel */}
                    <Skeleton className="h-20 w-full" /> {/* Text Area Skel */}
                    <Skeleton className="h-24 w-full" /> {/* Another Content Area Skel */}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center"><Skeleton className="h-4 w-1/3 mx-auto" /></div>
      </footer>
    </div>
  );
}


    
