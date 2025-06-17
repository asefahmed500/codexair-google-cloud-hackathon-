
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { CodeAnalysis, PullRequest as PRType, SecurityIssue, Suggestion, FileAnalysisItem, SimilarCodeResult } from '@/types';
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, AlertTriangle, Lightbulb, FileText, Thermometer, Zap, ShieldCheck, Activity, GitPullRequest, Github, Code2, Search, ThumbsUp, Info, RefreshCw, CheckCircle, GitBranch, CalendarDays, User, ClipboardCopy, FileSliders, CheckSquare, Square } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/layout/navbar'; 
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch'; 
import { Label } from '@/components/ui/label'; 

const FALLBACK_SUMMARY_MESSAGE = "Overall analysis summary could not be generated for this pull request.";

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
  const [currentSearchContext, setCurrentSearchContext] = useState<{type: 'security' | 'suggestion', title: string, filename: string} | null>(null);

  const [showTldrSummary, setShowTldrSummary] = useState(false);
  const [tldrSummaryText, setTldrSummaryText] = useState<string | null>(null);
  const [isFetchingTldr, setIsFetchingTldr] = useState(false);
  const [tldrError, setTldrError] = useState<string | null>(null);

  const [showResolvedSecurityIssues, setShowResolvedSecurityIssues] = useState(true);
  const [showResolvedSuggestions, setShowResolvedSuggestions] = useState(true);


  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && analysisId) {
      setLoading(true);
      setShowTldrSummary(false); 
      setTldrSummaryText(null);
      setTldrError(null);
      fetch(`/api/analysis-results/${analysisId}`)
        .then(res => {
          if (!res.ok) {
            const errorData = res.json();
            return errorData.then(err => { throw new Error(err.details || err.error || 'Failed to fetch analysis details')});
          }
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
          toast({ title: "Error", description: err.message, variant: "destructive" });
        });
    }
  }, [status, router, analysisId]);

  const handleTldrToggle = async (checked: boolean) => {
    setShowTldrSummary(checked);
    if (checked && !tldrSummaryText && analysisId && !isFetchingTldr) {
      setIsFetchingTldr(true);
      setTldrError(null);
      try {
        const response = await fetch(`/api/analysis-results/${analysisId}/tldr-summary`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || errorData.error || 'Failed to fetch TL;DR summary');
        }
        const data = await response.json();
        setTldrSummaryText(data.tldrSummary || "Could not generate TL;DR summary.");
      } catch (err: any) {
        setTldrError(err.message);
        setTldrSummaryText("Error loading TL;DR summary.");
        toast({ title: "TL;DR Error", description: err.message, variant: "destructive" });
      } finally {
        setIsFetchingTldr(false);
      }
    }
  };

  const handleFindSimilarCode = async (queryFilename: string, contextTitle: string, type: 'security' | 'suggestion') => {
    if (!analysisId) return;
    setIsSearchingSimilarCode(true);
    setSearchError(null);
    setSimilarCodeResults([]);
    setCurrentSearchContext({ type, title: contextTitle, filename: queryFilename});

    try {
      const response = await fetch('/api/search/similar-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            queryAnalysisId: analysisId, 
            queryFilename,
            sourceType: 'pr_analysis' 
        }),
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

  const handleCopyToClipboard = (text: string, itemName: string) => {
    if (!navigator.clipboard) {
      toast({ title: "Copy Failed", description: "Clipboard API not available in this browser.", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        toast({ title: "Copied to clipboard!", description: `Suggested fix for "${itemName}" copied.` });
      })
      .catch(err => {
        toast({ title: "Copy Failed", description: "Could not copy to clipboard. Please try again or copy manually.", variant: "destructive" });
        console.error('Failed to copy: ', err);
      });
  };
  
  const handleToggleResolved = async (
    itemType: 'security' | 'suggestion',
    itemIndex: number,
    currentResolvedStatus: boolean
  ) => {
    if (!analysisData) return;

    const itemToUpdate = itemType === 'security' 
      ? analysisData.analysis.securityIssues[itemIndex]
      : analysisData.analysis.suggestions[itemIndex];

    if (!itemToUpdate) return;

    // Optimistic UI update
    setAnalysisData(prevData => {
      if (!prevData) return null;
      const newAnalysis = { ...prevData.analysis };
      if (itemType === 'security') {
        newAnalysis.securityIssues = newAnalysis.securityIssues.map((issue, idx) => 
          idx === itemIndex ? { ...issue, resolved: !currentResolvedStatus } : issue
        );
      } else {
        newAnalysis.suggestions = newAnalysis.suggestions.map((sug, idx) =>
          idx === itemIndex ? { ...sug, resolved: !currentResolvedStatus } : sug
        );
      }
      return { ...prevData, analysis: newAnalysis };
    });
    
    try {
      const response = await fetch(`/api/analysis-items/${analysisId}/resolve-item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'pr_analysis',
          itemType,
          itemIdentifier: {
            title: itemToUpdate.title,
            file: itemToUpdate.file,
            line: itemToUpdate.line,
            description: itemToUpdate.description, 
          },
          resolved: !currentResolvedStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || `Failed to update ${itemType} status`);
      }
      toast({ title: "Status Updated", description: `${itemType === 'security' ? 'Security issue' : 'Suggestion'} marked as ${!currentResolvedStatus ? 'resolved' : 'unresolved'}.`});
    } catch (err: any) {
      // Revert optimistic update on error
      setAnalysisData(prevData => {
        if (!prevData) return null;
        const newAnalysis = { ...prevData.analysis };
        if (itemType === 'security') {
          newAnalysis.securityIssues = newAnalysis.securityIssues.map((issue, idx) => 
            idx === itemIndex ? { ...issue, resolved: currentResolvedStatus } : issue
          );
        } else {
          newAnalysis.suggestions = newAnalysis.suggestions.map((sug, idx) =>
            idx === itemIndex ? { ...sug, resolved: currentResolvedStatus } : sug
          );
        }
        return { ...prevData, analysis: newAnalysis };
      });
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };


  if (status === 'loading' || (loading && !analysisData && !error)) {
    return <AnalysisDetailsLoadingSkeleton />;
  }

  if (error || !analysisData) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
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
  const displayAiInsights = analysis.aiInsights && analysis.aiInsights !== FALLBACK_SUMMARY_MESSAGE && analysis.aiInsights.trim() !== ""
                            ? analysis.aiInsights
                            : "AI summary for this pull request is not available or could not be generated.";

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

  const filteredSecurityIssues = analysis.securityIssues?.filter(issue => showResolvedSecurityIssues || !issue.resolved);
  const filteredSuggestions = analysis.suggestions?.filter(suggestion => showResolvedSuggestions || !suggestion.resolved);


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex justify-between items-center">
             <Button variant="outline" onClick={() => router.push(`/analyze/${owner}/${repoName}`)}>Back to PRs for {owner}/{repoName}</Button>
        </div>

        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                    <CardTitle className="text-xl md:text-2xl lg:text-3xl font-bold font-headline flex items-center gap-2">
                        <GitPullRequest className="h-7 w-7 sm:h-8 sm:w-8 text-primary" /> PR #{pullRequest.number}: {pullRequest.title}
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
           {(analysis.aiInsights || displayAiInsights === FALLBACK_SUMMARY_MESSAGE) && (
            <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-muted/30">
                <div className="flex justify-between items-center w-full">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Lightbulb className="h-5 w-5 text-accent" />AI Review Summary (Overall PR):</h3>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="tldr-toggle-pr"
                      checked={showTldrSummary}
                      onCheckedChange={handleTldrToggle}
                      aria-label="Toggle TL;DR Summary"
                    />
                    <Label htmlFor="tldr-toggle-pr" className="text-sm font-medium">TL;DR</Label>
                  </div>
                </div>
                {isFetchingTldr && (
                  <div className="w-full flex items-center justify-center p-4">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Fetching TL;DR summary...
                  </div>
                )}
                {!isFetchingTldr && tldrError && (
                  <p className="text-destructive text-sm">Error: {tldrError}</p>
                )}
                {!isFetchingTldr && !tldrError && (
                  <ScrollArea className="h-auto max-h-48 w-full rounded-md border p-4 bg-background shadow">
                      <pre className={`text-sm whitespace-pre-wrap font-mono ${
                        (showTldrSummary && (!tldrSummaryText || tldrSummaryText === FALLBACK_SUMMARY_MESSAGE)) || 
                        (!showTldrSummary && (displayAiInsights === FALLBACK_SUMMARY_MESSAGE || !analysis.aiInsights || analysis.aiInsights.trim() === "")) 
                        ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                          {showTldrSummary ? (tldrSummaryText || "Generating TL;DR summary...") : displayAiInsights}
                      </pre>
                  </ScrollArea>
                )}
            </CardFooter>
          )}
        </Card>

        <Dialog>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="security">Security ({analysis.securityIssues?.length || 0})</TabsTrigger>
              <TabsTrigger value="suggestions">Suggestions ({analysis.suggestions?.length || 0})</TabsTrigger>
              <TabsTrigger value="file-details">File Details ({analysis.fileAnalyses?.length || 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle className="text-xl md:text-2xl">Overall Analysis Metrics</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <MetricCard Icon={Thermometer} title="Quality Score" value={analysis.qualityScore.toFixed(1)} unit="/ 10" />
                  <MetricCard Icon={Zap} title="Complexity Score" value={analysis.complexity.toFixed(1)} />
                  <MetricCard Icon={Activity} title="Maintainability Score" value={analysis.maintainability.toFixed(1)} />
                  <MetricCard Icon={ShieldCheck} title="Total Security Issues" value={analysis.securityIssues?.length || 0} />
                  <MetricCard Icon={Lightbulb} title="Total Suggestions" value={analysis.suggestions?.length || 0} />
                  <MetricCard Icon={FileText} title="Lines of Code Analyzed" value={analysis.metrics?.linesOfCode || 0} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security">
              <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-xl md:text-2xl">Security Issues</CardTitle>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="show-resolved-security"
                                checked={showResolvedSecurityIssues}
                                onCheckedChange={setShowResolvedSecurityIssues}
                            />
                            <Label htmlFor="show-resolved-security" className="text-sm">Show Resolved</Label>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                  {filteredSecurityIssues?.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {filteredSecurityIssues.map((issue, index) => (
                        <AccordionItem value={`issue-${index}`} key={index} className={`${issue.resolved ? 'opacity-60' : ''}`}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md text-sm sm:text-base">
                            <div className="flex items-center justify-between w-full">
                              <span className={`font-medium text-left ${issue.resolved ? 'line-through' : ''}`}>{issue.title}</span>
                              <div className="flex items-center gap-2">
                                 <Badge variant={getSeverityBadgeVariant(issue.severity)} className="capitalize">{issue.severity}</Badge>
                                  <span className="text-xs text-muted-foreground">{issue.file}:{issue.line || 'N/A'}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-3">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-xs text-muted-foreground">
                                    {issue.resolved ? 'Marked as Resolved' : 'Mark as Resolved'}
                                </p>
                                <Switch
                                    id={`resolve-security-${index}`}
                                    checked={!!issue.resolved}
                                    onCheckedChange={() => {
                                        const originalIndex = analysis.securityIssues.findIndex(
                                            origIssue => origIssue.title === issue.title && origIssue.file === issue.file && origIssue.line === issue.line && origIssue.description === issue.description
                                        );
                                        if (originalIndex !== -1) {
                                          handleToggleResolved('security', originalIndex, !!issue.resolved);
                                        }
                                    }}
                                    aria-label={issue.resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                                />
                            </div>
                            <p className="text-sm"><strong className="text-foreground">Description:</strong> {issue.description}</p>
                            <p className="text-sm"><strong className="text-foreground">File:</strong> {issue.file} {issue.line && `(Line: ${issue.line})`}</p>
                            <p className="text-sm font-medium text-foreground mb-1">Suggested Fix / Code:</p>
                            <ScrollArea className="max-h-60 w-full rounded-md border bg-background p-2 shadow-inner">
                                <pre className="text-xs font-code whitespace-pre-wrap">{issue.suggestion}</pre>
                            </ScrollArea>
                             {issue.suggestion && issue.suggestion.trim() !== "" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => handleCopyToClipboard(issue.suggestion, `Security Issue: ${issue.title}`)}
                                >
                                  <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Fix
                                </Button>
                            )}
                            {issue.cwe && <p className="text-sm mt-2"><strong className="text-foreground">CWE:</strong> <Badge variant="outline">{issue.cwe}</Badge></p>}
                            <DialogTrigger asChild>
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 h-auto text-xs mt-2 text-primary hover:underline block" 
                                onClick={() => handleFindSimilarCode(issue.file, issue.title, 'security')}
                                disabled={isSearchingSimilarCode && currentSearchContext?.filename === issue.file && currentSearchContext?.title === issue.title}
                              >
                                {isSearchingSimilarCode && currentSearchContext?.filename === issue.file && currentSearchContext?.title === issue.title ? 
                                  <><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Searching...</> : 
                                  <><Search className="mr-1 h-3 w-3" />Find similar past issues</>
                                }
                              </Button>
                            </DialogTrigger>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">{!showResolvedSecurityIssues && analysis.securityIssues?.some(i => i.resolved) ? "All resolved issues are hidden." : "No security issues found."}</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suggestions">
               <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-xl md:text-2xl">Improvement Suggestions</CardTitle>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="show-resolved-suggestions"
                                checked={showResolvedSuggestions}
                                onCheckedChange={setShowResolvedSuggestions}
                            />
                            <Label htmlFor="show-resolved-suggestions" className="text-sm">Show Resolved</Label>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                  {filteredSuggestions?.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {filteredSuggestions.map((suggestion, index) => (
                        <AccordionItem value={`suggestion-${index}`} key={index} className={`${suggestion.resolved ? 'opacity-60' : ''}`}>
                          <AccordionTrigger className="hover:bg-muted/50 px-2 rounded-md text-sm sm:text-base">
                           <div className="flex items-center justify-between w-full">
                              <span className={`font-medium text-left ${suggestion.resolved ? 'line-through' : ''}`}>{suggestion.title}</span>
                               <div className="flex items-center gap-2">
                                  <Badge variant={getIssueTypeBadgeVariant(suggestion.type)} className="capitalize">{suggestion.type.replace(/_/g, ' ')}</Badge>
                                  <Badge variant={getPriorityBadgeVariant(suggestion.priority)} className="capitalize">{suggestion.priority}</Badge>
                                  <span className="text-xs text-muted-foreground">{suggestion.file}:{suggestion.line || 'N/A'}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="p-4 bg-secondary/30 rounded-b-md space-y-3">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-xs text-muted-foreground">
                                    {suggestion.resolved ? 'Marked as Resolved' : 'Mark as Resolved'}
                                </p>
                                <Switch
                                    id={`resolve-suggestion-${index}`}
                                    checked={!!suggestion.resolved}
                                    onCheckedChange={() => {
                                        const originalIndex = analysis.suggestions.findIndex(
                                            origSug => origSug.title === suggestion.title && origSug.file === suggestion.file && origSug.line === suggestion.line && origSug.description === suggestion.description
                                        );
                                        if (originalIndex !== -1) {
                                            handleToggleResolved('suggestion', originalIndex, !!suggestion.resolved);
                                        }
                                    }}
                                    aria-label={suggestion.resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                                />
                            </div>
                            <p className="text-sm"><strong className="text-foreground">Description:</strong> {suggestion.description}</p>
                            <p className="text-sm"><strong className="text-foreground">File:</strong> {suggestion.file} {suggestion.line && `(Line: ${suggestion.line})`}</p>
                            {suggestion.codeExample && (
                              <>
                                <p className="text-sm font-medium text-foreground mb-1">Code Example:</p>
                                <ScrollArea className="max-h-60 w-full rounded-md border bg-background p-2 shadow-inner">
                                  <pre className="text-xs font-code whitespace-pre-wrap">{suggestion.codeExample}</pre>
                                </ScrollArea>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => handleCopyToClipboard(suggestion.codeExample!, `Suggestion: ${suggestion.title}`)}
                                >
                                  <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Fix
                                </Button>
                              </>
                            )}
                            <DialogTrigger asChild>
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 h-auto text-xs mt-2 text-primary hover:underline block" 
                                onClick={() => handleFindSimilarCode(suggestion.file, suggestion.title, 'suggestion')}
                                disabled={isSearchingSimilarCode && currentSearchContext?.filename === suggestion.file && currentSearchContext?.title === suggestion.title}
                              >
                                {isSearchingSimilarCode && currentSearchContext?.filename === suggestion.file && currentSearchContext?.title === suggestion.title ? 
                                  <><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Searching...</> : 
                                  <><Search className="mr-1 h-3 w-3" />Find similar past patterns</>
                                }
                              </Button>
                            </DialogTrigger>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : <p className="text-muted-foreground">{!showResolvedSuggestions && analysis.suggestions?.some(s => s.resolved) ? "All resolved suggestions are hidden." : "No specific suggestions available."}</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="file-details">
              <Card>
                <CardHeader><CardTitle className="text-xl md:text-2xl">File-by-File Analysis</CardTitle></CardHeader>
                <CardContent>
                  {analysis.fileAnalyses && analysis.fileAnalyses.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      {analysis.fileAnalyses.map((file, index) => (
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
                                      <li key={`sec-${i}`} className={`${si.resolved ? 'text-muted-foreground line-through' : ''}`}>
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
                                    <li key={`sug-${i}`} className={`${s.resolved ? 'text-muted-foreground line-through' : ''}`}>
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
                  ) : <p className="text-muted-foreground">No detailed file analyses available.</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Similar Code Found: <span className="text-primary">{currentSearchContext?.title || "Selected Issue"}</span> ({currentSearchContext?.filename})</DialogTitle>
              <DialogDescription>
                Showing code snippets from past analyses that are semantically similar to the context of <span className="font-semibold">"{currentSearchContext?.title || "the selected issue/suggestion"}"</span> from file <code className="bg-muted px-1 py-0.5 rounded text-xs">{currentSearchContext?.filename}</code>.
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
                            {result.searchResultType === 'pr_analysis' && result.prNumber && result.analysisId ? (
                                <Link 
                                    href={`/analyze/${result.owner}/${result.repoName}/${result.prNumber}/${result.analysisId}`} 
                                    className="text-primary hover:underline"
                                    target="_blank" rel="noopener noreferrer"
                                    title={`View PR Analysis: ${result.prTitle || 'PR Analysis'}`}
                                    >
                                    PR #{result.prNumber}: {result.prTitle || 'Untitled PR'}
                                </Link>
                            ) : result.searchResultType === 'repo_scan' && result.analysisId ? (
                                <Link 
                                    href={`/analyze/${result.owner}/${result.repoName}/scan/${result.analysisId}`} 
                                    className="text-primary hover:underline"
                                    target="_blank" rel="noopener noreferrer"
                                    title={`View Repository Scan: ${result.scanBranch || 'Repo Scan'}`}
                                    >
                                    Repo Scan: {result.repoName} ({result.scanBranch || 'default'})
                                </Link>
                            ) : (
                                'Analysis Result'
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Found in <code className="bg-background px-1 py-0.5 rounded text-xs">{result.filename}</code> (repo: {result.owner}/{result.repoName})
                          <br/>
                           {result.searchResultType === 'pr_analysis' && result.prAuthorLogin && (
                             <span>By: {result.prAuthorLogin} on {result.prCreatedAt ? format(new Date(result.prCreatedAt), 'MMM d, yyyy') : 'N/A'} (PR)</span>
                           )}
                           {result.searchResultType === 'repo_scan' && result.scanCreatedAt && (
                             <span>Scanned on: {format(new Date(result.scanCreatedAt), 'MMM d, yyyy')} (Repo Scan)</span>
                           )}
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

function AnalysisDetailsLoadingSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar /> 
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section Skeleton */}
        <div className="mb-6 flex justify-between items-center">
            <Skeleton className="h-10 w-48" /> {/* Back Button */}
        </div>

        {/* Main PR Info Card Skeleton */}
        <Card className="mb-6 shadow-lg">
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                    <div>
                        <Skeleton className="h-9 w-3/4 mb-2" /> {/* PR Title */}
                        <Skeleton className="h-5 w-1/2" /> {/* PR Description (owner/repo) */}
                    </div>
                    <Skeleton className="h-10 w-32" /> {/* GitHub Button */}
                </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-2 pt-4 border-t bg-muted/30">
                <div className="flex justify-between items-center w-full">
                    <Skeleton className="h-6 w-1/3 mb-1" /> {/* AI Review Summary Title */}
                    <Skeleton className="h-8 w-20" /> {/* TLDR Toggle Skeleton */}
                </div>
                <Skeleton className="h-24 w-full rounded-md border p-4" /> {/* AI Review Summary Content */}
            </CardFooter>
        </Card>

        {/* Tabs Skeleton */}
        <div className="w-full">
            <div className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6 h-10 bg-muted p-1 rounded-md">
              <Skeleton className="h-full w-full rounded-sm" />
              <Skeleton className="h-full w-full rounded-sm" />
              <Skeleton className="h-full w-full rounded-sm" />
              <Skeleton className="h-full w-full rounded-sm" />
            </div>
            
            {/* Tab Content Skeleton (Showing Overview as example) */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <Skeleton className="h-7 w-1/2" /> {/* Tab Card Title */}
                        <Skeleton className="h-8 w-32" /> {/* Show Resolved Toggle Skeleton */}
                    </div>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => ( // Example for overview metrics
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
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
            <Skeleton className="h-4 w-1/3 mx-auto" />
        </div>
      </footer>
    </div>
  );
}

