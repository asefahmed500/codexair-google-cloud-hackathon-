
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { CodeAnalysis, PullRequest as PRType, SecurityIssue, Suggestion, FileAnalysisItem, SimilarCodeResult } from '@/types';
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, AlertTriangle, Lightbulb, FileText, Thermometer, Zap, ShieldCheck, Activity, GitPullRequest, Github, Code2, Search, ThumbsUp, Info, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/layout/navbar'; 
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

export default function AnalysisDetailsPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repoName = params.repoName as string;
  const prNumber = params.prNumber as string;
  const analysisId = params.analysisId as string;

  const { data: session, status } = useSession();
  const router = useRouter();

  const [analysisData, setAnalysisData] = useState<{ analysis: CodeAnalysis; pullRequest: PRType } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [similarCodeResults, setSimilarCodeResults] = useState<SimilarCodeResult[]>([]);
  const [isSearchingSimilarCode, setIsSearchingSimilarCode] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currentSearchContext, setCurrentSearchContext] = useState<{type: 'security' | 'suggestion', title: string} | null>(null);


  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && analysisId) {
      setLoading(true);
      fetch(`/api/analysis-results/${analysisId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch analysis details');
          return res.json();
        })
        .then(data => {
          setAnalysisData(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError(err.message);
          setLoading(false);
        });
    }
  }, [status, router, analysisId]);

  const handleFindSimilarCode = async (queryFilename: string, contextTitle: string, type: 'security' | 'suggestion') => {
    if (!analysisId) return;
    setIsSearchingSimilarCode(true);
    setSearchError(null);
    setSimilarCodeResults([]);
    setCurrentSearchContext({ type, title: contextTitle});

    try {
      const response = await fetch('/api/search/similar-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryAnalysisId: analysisId, queryFilename }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to search for similar code');
      }
      const data = await response.json();
      setSimilarCodeResults(data.results || []);
      if ((data.results || []).length === 0) {
        toast({ title: "No Similar Code Found", description: "Could not find significantly similar code snippets from recent analyses."});
      }
    } catch (err: any) {
      setSearchError(err.message);
      toast({ title: "Search Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSearchingSimilarCode(false);
    }
  };


  if (status === 'loading' || (loading && !analysisData && !error)) {
    return <AnalysisDetailsLoadingSkeleton />;
  }

  if (error || !analysisData) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container py-8 flex items-center justify-center">
            <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <CardTitle className="text-destructive">Error Loading Analysis</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{error || "Could not load analysis data."}</p>
                <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
            </CardContent>
            </Card>
        </main>
      </div>
    );
  }
  
  const { analysis, pullRequest } = analysisData;

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
        <div className="mb-6 flex justify-between items-center">
             <Button variant="outline" onClick={() => router.push(`/analyze/${owner}/${repoName}`)}>Back to PRs for {owner}/{repoName}</Button>
        </div>

        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-3xl font-bold font-headline flex items-center gap-2">
                        <GitPullRequest className="h-8 w-8 text-primary" /> PR #{pullRequest.number}: {pullRequest.title}
                    </CardTitle>
                    <CardDescription className="mt-1">
                        Analysis for <Link href={`/analyze/${owner}/${repoName}`} className="text-primary hover:underline">{owner}/{repoName}</Link>
                    </CardDescription>
                </div>
                 <Link href={`https://github.com/${owner}/${repoName}/pull/${prNumber}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline"><Github className="mr-2 h-4 w-4"/>View on GitHub</Button>
                </Link>
            </div>
          </CardHeader>
           {analysis.aiInsights && (
            <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-muted/30">
                <h3 className="font-semibold text-lg flex items-center gap-2"><Lightbulb className="h-5 w-5 text-accent" />AI Review Summary:</h3>
                <ScrollArea className="h-auto max-h-48 w-full rounded-md border p-4 bg-background shadow">
                    <pre className="text-sm whitespace-pre-wrap text-foreground font-mono">{analysis.aiInsights}</pre>
                </ScrollArea>
            </CardFooter>
          )}
        </Card>

        <Dialog>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="security">Security Issues ({analysis.securityIssues?.length || 0})</TabsTrigger>
              <TabsTrigger value="suggestions">Suggestions ({analysis.suggestions?.length || 0})</TabsTrigger>
              <TabsTrigger value="file-details">File Details ({analysis.fileAnalyses?.length || 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle>Overall Analysis Metrics</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <MetricCard Icon={Thermometer} title="Quality Score" value={analysis.qualityScore.toFixed(1)} unit="/ 10" />
                  <MetricCard Icon={Zap} title="Complexity Score" value={analysis.complexity.toFixed(1)} />
                  <MetricCard Icon={Activity} title="Maintainability Score" value={analysis.maintainability.toFixed(1)} />
                  <MetricCard Icon={ShieldCheck} title="Security Issues" value={analysis.securityIssues?.length || 0} />
                  <MetricCard Icon={Lightbulb} title="Suggestions" value={analysis.suggestions?.length || 0} />
                  <MetricCard Icon={FileText} title="Lines of Code Analyzed" value={analysis.metrics?.linesOfCode || 0} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security">
              <Card>
                <CardHeader><CardTitle>Security Issues</CardTitle></CardHeader>
                <CardContent>
                  {analysis.securityIssues?.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {analysis.securityIssues.map((issue, index) => (
                        <AccordionItem value={`issue-${index}`} key={index}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md">
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium text-left">{issue.title}</span>
                              <div className="flex items-center gap-2">
                                 <Badge variant={getSeverityBadgeVariant(issue.severity)}>{issue.severity}</Badge>
                                  <span className="text-xs text-muted-foreground">{issue.file}:{issue.line || 'N/A'}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-2">
                            <p className="text-sm"><strong className="text-foreground">Description:</strong> {issue.description}</p>
                            <p className="text-sm"><strong className="text-foreground">File:</strong> {issue.file} {issue.line && `(Line: ${issue.line})`}</p>
                            <p className="text-sm font-medium text-foreground mb-1">Suggested Fix / Code:</p>
                            <ScrollArea className="max-h-60 w-full rounded-md border bg-background p-2 shadow-inner">
                                <pre className="text-xs font-code whitespace-pre-wrap">{issue.suggestion}</pre>
                            </ScrollArea>
                            {issue.cwe && <p className="text-sm mt-2"><strong className="text-foreground">CWE:</strong> <Badge variant="outline">{issue.cwe}</Badge></p>}
                            <DialogTrigger asChild>
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 h-auto text-xs mt-2 text-primary hover:underline"
                                onClick={() => handleFindSimilarCode(issue.file, issue.title, 'security')}
                                disabled={isSearchingSimilarCode}
                              >
                                {isSearchingSimilarCode && currentSearchContext?.type === 'security' && currentSearchContext?.title === issue.title ? 
                                  <><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Searching...</> : 
                                  <><Search className="mr-1 h-3 w-3" />Find similar past issues</>
                                }
                              </Button>
                            </DialogTrigger>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">No security issues found.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suggestions">
               <Card>
                <CardHeader><CardTitle>Improvement Suggestions</CardTitle></CardHeader>
                <CardContent>
                  {analysis.suggestions?.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {analysis.suggestions.map((suggestion, index) => (
                        <AccordionItem value={`suggestion-${index}`} key={index}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md">
                           <div className="flex items-center justify-between w-full">
                              <span className="font-medium text-left">{suggestion.title}</span>
                               <div className="flex items-center gap-2">
                                  <Badge variant={getPriorityBadgeVariant(suggestion.priority)}>{suggestion.priority}</Badge>
                                  <span className="text-xs text-muted-foreground">{suggestion.file}:{suggestion.line || 'N/A'}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-2">
                            <p className="text-sm"><strong className="text-foreground">Description:</strong> {suggestion.description}</p>
                            <p className="text-sm"><strong className="text-foreground">Type:</strong> <Badge variant="outline" className="capitalize">{suggestion.type}</Badge></p>
                            <p className="text-sm"><strong className="text-foreground">File:</strong> {suggestion.file} {suggestion.line && `(Line: ${suggestion.line})`}</p>
                            {suggestion.codeExample && (
                              <>
                                <p className="text-sm font-medium text-foreground mb-1">Code Example:</p>
                                <ScrollArea className="max-h-60 w-full rounded-md border bg-background p-2 shadow-inner">
                                  <pre className="text-xs font-code whitespace-pre-wrap">{suggestion.codeExample}</pre>
                                </ScrollArea>
                              </>
                            )}
                            <DialogTrigger asChild>
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 h-auto text-xs mt-2 text-primary hover:underline"
                                onClick={() => handleFindSimilarCode(suggestion.file, suggestion.title, 'suggestion')}
                                disabled={isSearchingSimilarCode}
                              >
                                {isSearchingSimilarCode && currentSearchContext?.type === 'suggestion' && currentSearchContext?.title === suggestion.title ? 
                                  <><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Searching...</> : 
                                  <><Search className="mr-1 h-3 w-3" />Find similar past issues</>
                                }
                              </Button>
                            </DialogTrigger>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">No specific suggestions available.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="file-details">
              <Card>
                <CardHeader><CardTitle>File-by-File Analysis</CardTitle></CardHeader>
                <CardContent>
                  {analysis.fileAnalyses && analysis.fileAnalyses.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {analysis.fileAnalyses.map((file, index) => (
                        <AccordionItem value={`file-${index}`} key={index}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md">
                            <div className="flex items-center justify-between w-full">
                               <div className="flex items-center gap-2">
                                  <Code2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-left">{file.filename}</span>
                               </div>
                              <Badge variant={file.qualityScore >= 7 ? "default" : file.qualityScore >=4 ? "outline" : "destructive"}>
                                  QS: {file.qualityScore.toFixed(1)}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <p><strong className="text-foreground">Quality Score:</strong> {file.qualityScore.toFixed(1)}</p>
                              <p><strong className="text-foreground">Complexity:</strong> {file.complexity.toFixed(1)}</p>
                              <p><strong className="text-foreground">Maintainability:</strong> {file.maintainability.toFixed(1)}</p>
                              <p><strong className="text-foreground">Lines of Code Analyzed:</strong> {file.metrics.linesOfCode}</p>
                            </div>
                            <Separator/>
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">Security Issues ({file.securityIssues.length}):</h4>
                              {file.securityIssues.length > 0 ? (
                                  <ul className="list-disc pl-5 space-y-1 text-xs">
                                  {file.securityIssues.map((si, i) => <li key={i}>{si.title} (<span className={`font-semibold ${si.severity === 'critical' || si.severity === 'high' ? 'text-destructive' : ''}`}>{si.severity}</span>)</li>)}
                                  </ul>
                              ) : <p className="text-xs text-muted-foreground">None</p>}
                            </div>
                             <div>
                              <h4 className="font-semibold text-foreground mb-1">Suggestions ({file.suggestions.length}):</h4>
                               {file.suggestions.length > 0 ? (
                                  <ul className="list-disc pl-5 space-y-1 text-xs">
                                  {file.suggestions.map((s, i) => <li key={i}>{s.title} ({s.priority} priority)</li>)}
                                  </ul>
                              ) : <p className="text-xs text-muted-foreground">None</p>}
                            </div>
                             {file.aiInsights && (
                              <div>
                                  <h4 className="font-semibold text-foreground mb-1">AI Insights for this file:</h4>
                                  <ScrollArea className="h-24 w-full rounded-md border bg-background p-2 shadow-inner">
                                      <pre className="text-xs whitespace-pre-wrap text-foreground font-mono">{file.aiInsights}</pre>
                                  </ScrollArea>
                              </div>
                             )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">No detailed file analyses available.</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Similar Code Found for: <span className="text-primary">{currentSearchContext?.title || "Selected Issue"}</span></DialogTitle>
              <DialogDescription>
                Showing code snippets from past analyses that are semantically similar to the context of <span className="font-semibold">"{currentSearchContext?.title || "the selected issue/suggestion"}"</span>.
              </DialogDescription>
            </DialogHeader>
            {isSearchingSimilarCode && 
                <div className="flex items-center justify-center py-10">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" /> 
                    <span className="ml-2">Searching for similar patterns...</span>
                </div>
            }
            {searchError && <p className="text-destructive text-center py-4">Error: {searchError}</p>}
            {!isSearchingSimilarCode && !searchError && similarCodeResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Info className="mx-auto h-8 w-8 mb-2" />
                No significantly similar code snippets found in recent analyses.
              </div>
            )}
            {!isSearchingSimilarCode && !searchError && similarCodeResults.length > 0 && (
              <ScrollArea className="max-h-[60vh] mt-4 pr-2">
                <div className="space-y-4">
                  {similarCodeResults.map((result, idx) => (
                    <Card key={idx} className="bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                            <Link 
                                href={`/analyze/${result.owner}/${result.repoName}/${result.prNumber}/${result.analysisId}`} 
                                className="text-primary hover:underline"
                                target="_blank" rel="noopener noreferrer"
                                title={`View Analysis: ${result.prTitle}`}
                                >
                                PR #{result.prNumber}: {result.prTitle}
                            </Link>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Found in <code className="bg-background px-1 py-0.5 rounded text-xs">{result.filename}</code> (repo: {result.owner}/{result.repoName})
                          <br/>
                          By: {result.prAuthorLogin || 'N/A'} on {format(new Date(result.prCreatedAt), 'MMM d, yyyy')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground mb-1">Similarity Score: <Badge variant="secondary">{(result.score * 100).toFixed(1)}%</Badge></p>
                        <p className="text-sm font-semibold text-foreground">AI Insights for this file (from past analysis):</p>
                        <ScrollArea className="max-h-28 w-full rounded-md border bg-background p-2 shadow-inner">
                            <pre className="text-xs whitespace-pre-wrap text-muted-foreground font-mono">{result.aiInsights || "No specific AI insight for this file."}</pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>


      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair.
        </div>
      </footer>
    </div>
  );
}

interface MetricCardProps { Icon: React.ElementType; title: string; value: string | number; unit?: string; }
function MetricCard({ Icon, title, value, unit }: MetricCardProps) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-accent" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">
          {value}
          {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisDetailsLoadingSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container py-8">
        {/* Header Section Skeleton */}
        <div className="mb-6 flex justify-between items-center">
            <Skeleton className="h-10 w-48" /> {/* Back Button */}
        </div>

        {/* Main PR Info Card Skeleton */}
        <Card className="mb-6 shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <Skeleton className="h-9 w-3/4 mb-2" /> {/* PR Title */}
                        <Skeleton className="h-5 w-1/2" /> {/* PR Description (owner/repo) */}
                    </div>
                    <Skeleton className="h-10 w-32" /> {/* GitHub Button */}
                </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-muted/30">
                <Skeleton className="h-6 w-1/4 mb-2" /> {/* AI Review Summary Title */}
                <Skeleton className="h-24 w-full rounded-md border p-4" /> {/* AI Review Summary Content */}
            </CardFooter>
        </Card>

        {/* Tabs Skeleton */}
        <div className="w-full">
            <Skeleton className="h-10 w-full grid grid-cols-4 mb-6 p-1 rounded-md bg-muted" /> {/* Tabs List */}
            
            {/* Tab Content Skeleton (Showing Overview as example) */}
            <Card>
                <CardHeader><Skeleton className="h-7 w-1/2" /></CardHeader> {/* Tab Card Title */}
                <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <Card key={i} className="shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <Skeleton className="h-5 w-2/3" /> {/* Metric Title */}
                                <Skeleton className="h-5 w-5" /> {/* Metric Icon */}
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-1/2" /> {/* Metric Value */}
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>
        </div>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
            <Skeleton className="h-4 w-1/3 mx-auto" />
        </div>
      </footer>
    </div>
  );
}

