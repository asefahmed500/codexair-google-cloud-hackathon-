'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { CodeAnalysis, PullRequest as PRType, SecurityIssue, Suggestion, FileAnalysisItem } from '@/types';
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, AlertTriangle, Lightbulb, FileText, Thermometer, Zap, ShieldCheck, Activity, GitPullRequest, Github } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from '@/components/ui/skeleton';

// Mock API call, replace with actual data fetching
async function fetchAnalysisDetails(analysisId: string): Promise<{ analysis: CodeAnalysis; pullRequest: PRType } | null> {
  // In a real app, you'd fetch this from /api/analysis/${analysisId} or similar
  // This is a placeholder. The actual data fetching logic will depend on how you store and retrieve combined PR and Analysis data.
  // For now, we assume the analysisId gives us all we need, or we use the PR details from params.
  // It's more likely you'd fetch PR details, and that PR object would contain the analysis or its ID.
  // Let's assume an API endpoint exists: /api/pullrequests/${owner}/${repoName}/${prNumber} which returns PR with populated analysis
  const { owner, repoName, prNumber } = useParams() as { owner: string; repoName: string; prNumber: string };

  if (!owner || !repoName || !prNumber) return null;

  const response = await fetch(`/api/pullrequests/details/${owner}/${repoName}/${prNumber}`);
  if (!response.ok) {
    console.error("Failed to fetch PR details with analysis");
    return null;
  }
  const data = await response.json();
  return { analysis: data.pullRequest.analysis, pullRequest: data.pullRequest };
}


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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && analysisId) {
      setLoading(true);
      fetch(`/api/analysis-results/${analysisId}`) // Assuming an API route to fetch analysis by ID
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

  if (status === 'loading' || loading) {
    return <AnalysisDetailsLoadingSkeleton />;
  }

  if (error || !analysisData) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error || "Could not load analysis data."}</p>
            <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const { analysis, pullRequest } = analysisData;

  const getSeverityBadgeVariant = (severity: SecurityIssue['severity']) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default'; // Consider an orange/yellow variant
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
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground font-headline">CodeReviewAI</span>
          </Link>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push(`/analyze/${owner}/${repoName}`)}>Back to PRs</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 py-1 h-auto">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || 'User'} />
                    <AvatarFallback>{session?.user?.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                   <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{session?.user?.name || 'My Account'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                    <BarChartBig className="mr-2 h-4 w-4" /> Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/analyze')}>
                    <Github className="mr-2 h-4 w-4" /> Analyze Repo
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
        </Card>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="security">Security Issues ({analysis.securityIssues?.length || 0})</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions ({analysis.suggestions?.length || 0})</TabsTrigger>
            <TabsTrigger value="file-details">File Details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Analysis Overview</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard Icon={Thermometer} title="Quality Score" value={analysis.qualityScore.toFixed(1)} unit="/ 10" />
                <MetricCard Icon={Zap} title="Complexity Score" value={analysis.complexity.toFixed(1)} />
                <MetricCard Icon={Activity} title="Maintainability Score" value={analysis.maintainability.toFixed(1)} />
                <MetricCard Icon={ShieldCheck} title="Security Issues" value={analysis.securityIssues?.length || 0} />
                <MetricCard Icon={Lightbulb} title="Suggestions" value={analysis.suggestions?.length || 0} />
                <MetricCard Icon={FileText} title="Lines of Code" value={analysis.metrics?.linesOfCode || 0} />
              </CardContent>
              {analysis.aiInsights && (
                <CardFooter className="flex-col items-start gap-2 pt-4 border-t">
                    <h3 className="font-semibold text-lg">AI Insights:</h3>
                    <ScrollArea className="h-40 w-full rounded-md border p-4 bg-secondary/30">
                        <pre className="text-sm whitespace-pre-wrap text-foreground">{analysis.aiInsights}</pre>
                    </ScrollArea>
                </CardFooter>
              )}
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
                        <AccordionContent className="p-4 bg-secondary/30 rounded-b-md">
                          <p className="text-sm mb-2"><strong className="text-foreground">Description:</strong> {issue.description}</p>
                          <p className="text-sm mb-2"><strong className="text-foreground">File:</strong> {issue.file} {issue.line && `(Line: ${issue.line})`}</p>
                          <p className="text-sm mb-2"><strong className="text-foreground">Suggestion:</strong> {issue.suggestion}</p>
                          {issue.cwe && <p className="text-sm"><strong className="text-foreground">CWE:</strong> {issue.cwe}</p>}
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
                        <AccordionContent className="p-4 bg-secondary/30 rounded-b-md">
                          <p className="text-sm mb-2"><strong className="text-foreground">Description:</strong> {suggestion.description}</p>
                          <p className="text-sm mb-2"><strong className="text-foreground">Type:</strong> <Badge variant="outline">{suggestion.type}</Badge></p>
                          <p className="text-sm mb-2"><strong className="text-foreground">File:</strong> {suggestion.file} {suggestion.line && `(Line: ${suggestion.line})`}</p>
                          {suggestion.codeExample && (
                            <>
                              <p className="text-sm font-medium text-foreground mb-1">Code Example:</p>
                              <ScrollArea className="max-h-60 w-full rounded-md border bg-background p-2">
                                <pre className="text-xs font-code whitespace-pre-wrap">{suggestion.codeExample}</pre>
                              </ScrollArea>
                            </>
                          )}
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
                            <span className="font-medium text-left">{file.filename}</span>
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
                            <p><strong className="text-foreground">Lines of Code:</strong> {file.metrics.linesOfCode}</p>
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
                                <ScrollArea className="h-24 w-full rounded-md border bg-background p-2">
                                    <pre className="text-xs whitespace-pre-wrap text-foreground">{file.aiInsights}</pre>
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
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} CodeReviewAI.
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
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
            <Skeleton className="h-8 w-40" /> {/* Logo/Title */}
            <div className="flex items-center gap-4">
                <Skeleton className="h-9 w-32" /> {/* Back Button */}
                <Skeleton className="h-10 w-10 rounded-full" /> {/* Avatar Dropdown */}
            </div>
        </div>
      </header>
      <main className="flex-1 container py-8">
        <Card className="mb-6">
            <CardHeader>
                <Skeleton className="h-10 w-3/4 mb-2" /> {/* PR Title */}
                <Skeleton className="h-5 w-1/2" /> {/* PR Description */}
            </CardHeader>
        </Card>
        <Skeleton className="h-10 w-full mb-6" /> {/* Tabs List */}
        
        <Card>
            <CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader> {/* Tab Content Title */}
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2"><Skeleton className="h-5 w-2/3" /></CardHeader>
                        <CardContent><Skeleton className="h-8 w-1/2" /></CardContent>
                    </Card>
                ))}
            </CardContent>
            <CardFooter className="pt-4 border-t">
                <Skeleton className="h-6 w-1/4 mb-2" /> {/* AI Insights Title */}
                <Skeleton className="h-32 w-full" /> {/* AI Insights Content */}
            </CardFooter>
        </Card>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center"><Skeleton className="h-4 w-1/3 mx-auto" /></div>
      </footer>
    </div>
  );
}

// Create new API route src/app/api/analysis-results/[analysisId]/route.ts
// This route should fetch the analysis document and its associated pull request document.
// For brevity in this response, the actual API route implementation is omitted but is crucial.
