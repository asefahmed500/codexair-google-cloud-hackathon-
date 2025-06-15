
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { RepositoryScanResult, SecurityIssue, Suggestion, FileAnalysisItem, SimilarCodeResult } from '@/types';
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, AlertTriangle, Lightbulb, FileText, Thermometer, Zap, ShieldCheck, Activity, GitPullRequest, Github, Code2, Search, ThumbsUp, Info, RefreshCw, CheckCircle, ScanSearch } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/layout/navbar'; 
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertTitle as AlertBoxTitle, AlertDescription as AlertBoxDescription } from "@/components/ui/alert";


const FALLBACK_SUMMARY_MESSAGE = "Overall repository scan summary could not be generated.";

export default function RepositoryScanDetailsPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repoName = params.repoName as string;
  const scanId = params.scanId as string;

  const { data: session, status } = useSession();
  const router = useRouter();

  const [scanData, setScanData] = useState<RepositoryScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for semantic search (similar to PR analysis page)
  const [similarCodeResults, setSimilarCodeResults] = useState<SimilarCodeResult[]>([]);
  const [isSearchingSimilarCode, setIsSearchingSimilarCode] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currentSearchContext, setCurrentSearchContext] = useState<{type: 'security' | 'suggestion', title: string, filename: string} | null>(null);


  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && scanId) {
      setLoading(true);
      fetch(`/api/repository-scan/${scanId}`)
        .then(res => {
          if (!res.ok) {
            return res.json().then(err => { throw new Error(err.details || err.error || 'Failed to fetch repository scan details')});
          }
          return res.json();
        })
        .then(data => {
          setScanData(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError(err.message);
          setLoading(false);
          toast({ title: "Error Fetching Scan", description: err.message, variant: "destructive" });
        });
    }
  }, [status, router, scanId]);

  // Semantic search handler (can be adapted from PR analysis page if needed, for now placeholder)
  const handleFindSimilarCode = async (queryFilename: string, contextTitle: string, type: 'security' | 'suggestion') => {
    if (!scanId) return; 
    toast({title: "Semantic Search Info", description: "Semantic search from full repository scans is contextually different and will be refined. Currently uses PR analysis context.", variant: "default"})

    setIsSearchingSimilarCode(true);
    setSearchError(null);
    setSimilarCodeResults([]);
    setCurrentSearchContext({ type, title: contextTitle, filename: queryFilename});

    try {
      const response = await fetch('/api/search/similar-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryAnalysisId: scanData?.repositoryId, queryFilename }), // Using repositoryId might be wrong
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to search for similar code');
      }
      const data = await response.json();
      setSimilarCodeResults(data.results || []);
      if ((data.results || []).length === 0) {
        toast({ title: "No Similar Code Found", description: `Could not find significantly similar code patterns related to "${contextTitle}" in ${queryFilename} from recent analyses.`});
      }
    } catch (err: any) {
      setSearchError(err.message);
      toast({ title: "Search Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSearchingSimilarCode(false);
    }
  };


  if (status === 'loading' || (loading && !scanData && !error)) {
    return <ScanDetailsLoadingSkeleton owner={owner} repoName={repoName}/>;
  }

  if (error || !scanData) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
            <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <CardTitle className="text-destructive">Error Loading Repository Scan</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{error || "Could not load repository scan data."}</p>
                <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
            </CardContent>
            </Card>
        </main>
      </div>
    );
  }
  
  const displayAiInsights = scanData.summaryAiInsights && scanData.summaryAiInsights !== FALLBACK_SUMMARY_MESSAGE && scanData.summaryAiInsights.trim() !== ""
                            ? scanData.summaryAiInsights
                            : "AI summary for this repository scan is not available or could not be generated.";

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
  const getIssueTypeBadgeVariant = (type: Suggestion['type'] | SecurityIssue['type']) => {
      switch (type) {
          case 'bug': case 'vulnerability': return 'destructive';
          case 'performance': case 'optimization': return 'default';
          case 'style': case 'code_smell': return 'secondary';
          case 'feature': return 'outline'; 
          case 'warning': case 'info': return 'secondary'; 
          default: return 'outline';
      }
  };


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex justify-between items-center">
             <Button variant="outline" onClick={() => router.push(`/analyze/${owner}/${repoName}`)}>Back to {owner}/{repoName}</Button>
        </div>

        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                    <CardTitle className="text-xl md:text-2xl lg:text-3xl font-bold font-headline flex items-center gap-2">
                        <ScanSearch className="h-7 w-7 sm:h-8 sm:w-8 text-primary" /> Repository Scan: {owner}/{repoName}
                    </CardTitle>
                    <CardDescription className="mt-1">
                        Branch: {scanData.branchAnalyzed} (Commit: {scanData.commitShaAnalyzed.substring(0,7)})
                        <br/>
                        Scanned on: {format(new Date(scanData.createdAt), 'PPpp')}
                    </CardDescription>
                </div>
                 <Link href={`https://github.com/${owner}/${repoName}/tree/${scanData.commitShaAnalyzed}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline"><Github className="mr-2 h-4 w-4"/>View on GitHub at this commit</Button>
                </Link>
            </div>
          </CardHeader>
            <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-muted/30">
                 <Alert variant="default" className="w-full border-primary/30 bg-primary/5">
                    <Info className="h-5 w-5 text-primary" />
                    <AlertBoxTitle className="text-md font-semibold text-primary">Full Repository Scan Information</AlertBoxTitle>
                    <AlertBoxDescription className="text-sm text-primary-foreground/80">
                        This is a full repository scan of the default branch (<code className="bg-primary/10 px-1 rounded text-xs">{scanData.branchAnalyzed}</code>).
                        For this version, AI analysis was performed on a limited number of source files (up to 5) to ensure timely results.
                        This analysis is not tied to a specific Pull Request.
                    </AlertBoxDescription>
                </Alert>

                <h3 className="font-semibold text-lg flex items-center gap-2 mt-3"><Lightbulb className="h-5 w-5 text-accent" />AI Summary (Overall Repository):</h3>
                <ScrollArea className="h-auto max-h-48 w-full rounded-md border p-4 bg-background shadow">
                    <pre className={`text-sm whitespace-pre-wrap font-mono ${scanData.summaryAiInsights === FALLBACK_SUMMARY_MESSAGE || !scanData.summaryAiInsights || scanData.summaryAiInsights.trim() === "" ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                        {displayAiInsights}
                    </pre>
                </ScrollArea>
            </CardFooter>
        </Card>

        <Dialog>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="security">Security ({scanData.securityIssues?.length || 0})</TabsTrigger>
              <TabsTrigger value="suggestions">Suggestions ({scanData.suggestions?.length || 0})</TabsTrigger>
              <TabsTrigger value="file-details">File Details ({scanData.fileAnalyses?.length || 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle className="text-xl md:text-2xl">Overall Scan Metrics</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <MetricCard Icon={Thermometer} title="Quality Score" value={scanData.qualityScore.toFixed(1)} unit="/ 10" />
                  <MetricCard Icon={Zap} title="Complexity Score" value={scanData.complexity.toFixed(1)} />
                  <MetricCard Icon={Activity} title="Maintainability Score" value={scanData.maintainability.toFixed(1)} />
                  <MetricCard Icon={ShieldCheck} title="Total Security Issues" value={scanData.securityIssues?.length || 0} />
                  <MetricCard Icon={Lightbulb} title="Total Suggestions" value={scanData.suggestions?.length || 0} />
                  <MetricCard Icon={FileText} title="Lines of Code Analyzed" value={scanData.metrics?.linesOfCode || 0} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security">
              <Card>
                <CardHeader><CardTitle className="text-xl md:text-2xl">Security Issues</CardTitle></CardHeader>
                <CardContent>
                  {scanData.securityIssues?.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {scanData.securityIssues.map((issue, index) => (
                        <AccordionItem value={`issue-${index}`} key={index}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md text-sm sm:text-base">
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium text-left">{issue.title}</span>
                              <div className="flex items-center gap-2">
                                 <Badge variant={getSeverityBadgeVariant(issue.severity)} className="capitalize">{issue.severity}</Badge>
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
                            {/* Semantic Search from here might be less effective without `queryAnalysisId` specific to PR */}
                            {/* <DialogTrigger asChild>
                              <Button variant="link" size="sm" className="p-0 h-auto text-xs mt-2 text-primary hover:underline"
                                onClick={() => handleFindSimilarCode(issue.file, issue.title, 'security')}
                                disabled={isSearchingSimilarCode && currentSearchContext?.filename === issue.file && currentSearchContext?.title === issue.title}
                              >
                                {isSearchingSimilarCode && currentSearchContext?.filename === issue.file && currentSearchContext?.title === issue.title ? 
                                  <><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Searching...</> : 
                                  <><Search className="mr-1 h-3 w-3" />Find similar past issues</>
                                }
                              </Button>
                            </DialogTrigger> */}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">No security issues found in this scan.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suggestions">
               <Card>
                <CardHeader><CardTitle className="text-xl md:text-2xl">Improvement Suggestions</CardTitle></CardHeader>
                <CardContent>
                  {scanData.suggestions?.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {scanData.suggestions.map((suggestion, index) => (
                        <AccordionItem value={`suggestion-${index}`} key={index}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md text-sm sm:text-base">
                           <div className="flex items-center justify-between w-full">
                              <span className="font-medium text-left">{suggestion.title}</span>
                               <div className="flex items-center gap-2">
                                  <Badge variant={getIssueTypeBadgeVariant(suggestion.type)} className="capitalize">{suggestion.type.replace(/_/g, ' ')}</Badge>
                                  <Badge variant={getPriorityBadgeVariant(suggestion.priority)} className="capitalize">{suggestion.priority}</Badge>
                                  <span className="text-xs text-muted-foreground">{suggestion.file}:{suggestion.line || 'N/A'}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-2">
                            <p className="text-sm"><strong className="text-foreground">Description:</strong> {suggestion.description}</p>
                            <p className="text-sm"><strong className="text-foreground">File:</strong> {suggestion.file} {suggestion.line && `(Line: ${suggestion.line})`}</p>
                            {suggestion.codeExample && (
                              <>
                                <p className="text-sm font-medium text-foreground mb-1">Code Example:</p>
                                <ScrollArea className="max-h-60 w-full rounded-md border bg-background p-2 shadow-inner">
                                  <pre className="text-xs font-code whitespace-pre-wrap">{suggestion.codeExample}</pre>
                                </ScrollArea>
                              </>
                            )}
                            {/* Semantic Search trigger can be added here as well, with same caveat as above */}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">No specific improvement suggestions available from this scan.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="file-details">
              <Card>
                <CardHeader><CardTitle className="text-xl md:text-2xl">File-by-File Analysis</CardTitle></CardHeader>
                <CardContent>
                  {scanData.fileAnalyses && scanData.fileAnalyses.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {scanData.fileAnalyses.map((file, index) => (
                        <AccordionItem value={`file-${index}`} key={index}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md text-sm sm:text-base">
                            <div className="flex items-center justify-between w-full">
                               <div className="flex items-center gap-2">
                                  <Code2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-left">{file.filename}</span>
                               </div>
                              <Badge variant={file.qualityScore >= 7 ? "default" : file.qualityScore >=4 ? "outline" : "destructive"} 
                                     className={file.qualityScore >= 7 ? 'bg-green-100 text-green-700 border-green-300' : file.qualityScore >=4 ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-red-100 text-red-700 border-red-300'}>
                                  QS: {file.qualityScore.toFixed(1)}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <p><strong className="text-foreground">Quality Score:</strong> {file.qualityScore.toFixed(1)}</p>
                              <p><strong className="text-foreground">Complexity:</strong> {file.complexity.toFixed(1)}</p>
                              <p><strong className="text-foreground">Maintainability:</strong> {file.maintainability.toFixed(1)}</p>
                              <p><strong className="text-foreground">Lines of Code:</strong> {file.metrics.linesOfCode}</p>
                            </div>
                            <Separator/>
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">Security Issues ({file.securityIssues.length}):</h4>
                              {file.securityIssues.length > 0 ? (
                                  <ul className="list-disc pl-5 space-y-1 text-xs">
                                  {file.securityIssues.map((si, i) => (
                                      <li key={`sec-${i}`}>
                                        {si.title} (<Badge variant={getSeverityBadgeVariant(si.severity)} className="capitalize text-[10px] px-1 py-0">{si.severity}</Badge>)
                                        {si.cwe && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">{si.cwe}</Badge>}
                                      </li>
                                  ))}
                                  </ul>
                              ) : <p className="text-xs text-muted-foreground">None</p>}
                            </div>
                             <div>
                              <h4 className="font-semibold text-foreground mb-1">Suggestions ({file.suggestions.length}):</h4>
                               {file.suggestions.length > 0 ? (
                                  <ul className="list-disc pl-5 space-y-1 text-xs">
                                  {file.suggestions.map((s, i) => (
                                    <li key={`sug-${i}`}>
                                        {s.title} (<Badge variant={getPriorityBadgeVariant(s.priority)} className="capitalize text-[10px] px-1 py-0">{s.priority}</Badge>
                                        <Badge variant={getIssueTypeBadgeVariant(s.type)} className="ml-1 capitalize text-[10px] px-1 py-0">{s.type.replace(/_/g, ' ')}</Badge>)
                                    </li>
                                  ))}
                                  </ul>
                              ) : <p className="text-xs text-muted-foreground">None</p>}
                            </div>
                             {file.aiInsights && file.aiInsights.trim() !== "" && (
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
                  ) : <p className="text-muted-foreground">No detailed file analyses available for this scan.</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* Semantic Search Dialog - can be enabled once backend is adapted for repo scans */}
          {/* 
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Similar Code Found: <span className="text-primary">{currentSearchContext?.title || "Selected Issue"}</span> ({currentSearchContext?.filename})</DialogTitle>
              <DialogDescription>
                Showing code snippets from past analyses that are semantically similar to the context of <span className="font-semibold">"{currentSearchContext?.title || "the selected issue/suggestion"}"</span> from file <code className="bg-muted px-1 py-0.5 rounded text-xs">{currentSearchContext?.filename}</code>.
              </DialogDescription>
            </DialogHeader>
             {isSearchingSimilarCode && <div className="flex items-center justify-center py-10"><RefreshCw className="h-6 w-6 animate-spin text-primary" /> <span className="ml-2">Searching...</span></div>}
            {searchError && <p className="text-destructive text-center py-4">Error: {searchError}</p>}
            {!isSearchingSimilarCode && !searchError && similarCodeResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground"><Info className="mx-auto h-8 w-8 mb-2" />No significantly similar code snippets found.</div>
            )}
            {!isSearchingSimilarCode && !searchError && similarCodeResults.length > 0 && (
              <ScrollArea className="max-h-[60vh] mt-4 pr-2">
                 <div className="space-y-4">
                  {similarCodeResults.map((result, idx) => (
                    <Card key={idx} className="bg-muted/30">
                      <CardHeader className="pb-2"><CardTitle className="text-base"><Link href={`/analyze/${result.owner}/${result.repoName}/${result.prNumber}/${result.analysisId}`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" title={`View Analysis: ${result.prTitle}`}>PR #{result.prNumber}: {result.prTitle}</Link></CardTitle><CardDescription className="text-xs">Found in <code className="bg-background px-1 py-0.5 rounded text-xs">{result.filename}</code> (repo: {result.owner}/{result.repoName})<br/>By: {result.prAuthorLogin || 'N/A'} on {result.prCreatedAt ? format(new Date(result.prCreatedAt), 'MMM d, yyyy') : 'N/A'}</CardDescription></CardHeader>
                      <CardContent><p className="text-xs text-muted-foreground mb-1">Similarity Score: <Badge variant="secondary">{(result.score * 100).toFixed(1)}%</Badge></p><p className="text-sm font-semibold text-foreground">AI Insights for this file (from past analysis):</p><ScrollArea className="max-h-28 w-full rounded-md border bg-background p-2 shadow-inner"><pre className="text-xs whitespace-pre-wrap text-muted-foreground font-mono">{result.aiInsights || "No specific AI insight for this file."}</pre></ScrollArea></CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
            <DialogFooter className="mt-4"><DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose></DialogFooter>
          </DialogContent>
           */}
        </Dialog>


      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
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

function ScanDetailsLoadingSkeleton({owner, repoName}: {owner: string, repoName: string}) {
  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex justify-between items-center">
            <Skeleton className="h-10 w-48" /> 
        </div>
        <Card className="mb-6 shadow-lg">
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                    <div>
                        <Skeleton className="h-9 w-3/4 mb-2" /> 
                        <Skeleton className="h-5 w-1/2" /> 
                    </div>
                    <Skeleton className="h-10 w-32" /> 
                </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-muted/30">
                <Skeleton className="h-16 w-full mb-2" /> {/* Alert box placeholder */}
                <Skeleton className="h-6 w-1/4 mb-2" /> 
                <Skeleton className="h-24 w-full rounded-md border p-4" /> 
            </CardFooter>
        </Card>
        <div className="w-full">
            <div className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6 h-10 bg-muted p-1 rounded-md">
              <Skeleton className="h-full w-full rounded-sm" />
              <Skeleton className="h-full w-full rounded-sm" />
              <Skeleton className="h-full w-full rounded-sm" />
              <Skeleton className="h-full w-full rounded-sm" />
            </div>
            <Card>
                <CardHeader><Skeleton className="h-7 w-1/2" /></CardHeader> 
                <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <Card key={i} className="shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <Skeleton className="h-5 w-2/3" /> 
                                <Skeleton className="h-5 w-5" /> 
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-1/2" /> 
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>
        </div>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
            <Skeleton className="h-4 w-1/3 mx-auto" />
        </div>
      </footer>
    </div>
  );
}
