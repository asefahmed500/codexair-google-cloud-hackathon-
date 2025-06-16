
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchCode, RefreshCw, AlertTriangle, Brain, Lightbulb, Github, User, CalendarDays, GitBranch } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { SimilarCodeResult } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format } from 'date-fns';


export default function SemanticSearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [queryText, setQueryText] = useState('');
  const [searchResults, setSearchResults] = useState<SimilarCodeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const handleSubmitSearch = async () => {
    if (!queryText.trim()) {
      toast({ title: "Input Required", description: "Please enter code or a description to search.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchResults([]);

    try {
      const response = await fetch('/api/search/semantic-text-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryText }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Failed to perform semantic search');
      }
      
      setSearchResults(result.results || []);
      if ((result.results || []).length === 0) {
        toast({ title: "No Results", description: "No similar code patterns found for your query.", variant: "default" });
      } else {
        toast({ title: "Search Complete", description: `Found ${result.results.length} similar item(s).` });
      }

    } catch (err: any) {
      setError(err.message);
      toast({ title: "Search Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  
  if (status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="max-w-3xl mx-auto shadow-lg">
            <CardHeader><Skeleton className="h-8 w-56 mb-2" /><Skeleton className="h-4 w-full" /></CardHeader>
            <CardContent className="space-y-6 pt-4">
              <Skeleton className="h-24 w-full" /> {/* Textarea */}
              <Skeleton className="h-10 w-full" /> {/* Button */}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  if (status === 'unauthenticated') return null;

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="max-w-3xl mx-auto shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold font-headline flex items-center">
              <Brain className="mr-3 h-8 w-8 text-primary" />
              Semantic Code Search
            </CardTitle>
            <CardDescription>
              Find similar code patterns or issues across your analyzed pull requests and repository scans. Paste a code snippet or describe a problem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor="search-query-input" className="block text-sm font-medium text-foreground mb-1.5">
                Search Query (Code Snippet or Description)
              </label>
              <Textarea
                id="search-query-input"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Examples:\n- 'How to securely handle file uploads in Node.js to prevent path traversal.'\n- 'Common off-by-one errors in loop conditions.'\n- Or paste a code snippet directly:\n\nfunction example(arr) {\n  for (let i = 0; i <= arr.length; i++) { // off-by-one error\n    console.log(arr[i]);\n  }\n}"
                rows={8}
                className="font-mono text-sm bg-background shadow-inner focus:ring-primary/50"
              />
            </div>
            <Button onClick={handleSubmitSearch} disabled={isLoading || !queryText.trim()} className="w-full shadow-md hover:shadow-lg transition-shadow text-base py-3">
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <SearchCode className="mr-2 h-5 w-5" />
                  Search
                </>
              )}
            </Button>
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Search Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {(!isLoading && searchResults.length > 0) && (
          <section className="mt-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-center sm:text-left text-foreground">Search Results ({searchResults.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {searchResults.map((result) => (
                <Card key={`${result.analysisId}-${result.filename}`} className="bg-card shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold truncate hover:text-primary transition-colors">
                       {result.searchResultType === 'pr_analysis' && result.prNumber && result.analysisId ? (
                         <Link href={`/analyze/${result.owner}/${result.repoName}/${result.prNumber}/${result.analysisId}`}
                               title={`View Analysis: ${result.prTitle || 'PR Analysis'}`}
                               target="_blank" rel="noopener noreferrer">
                           PR #{result.prNumber}: {result.prTitle || 'Untitled PR'}
                         </Link>
                       ) : result.searchResultType === 'repo_scan' && result.analysisId ? (
                         <Link href={`/analyze/${result.owner}/${result.repoName}/scan/${result.analysisId}`}
                               title={`View Repository Scan: ${result.scanBranch || 'Repo Scan'}`}
                               target="_blank" rel="noopener noreferrer">
                           Repo Scan: {result.repoName} ({result.scanBranch || 'default'})
                         </Link>
                       ) : (
                         'Analysis Result'
                       )}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                        In <code className="bg-muted px-1 py-0.5 rounded text-xs">{result.filename}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        {result.searchResultType === 'pr_analysis' ? (
                            <>
                                <span className="flex items-center gap-1" title={`Author: ${result.prAuthorLogin || 'N/A'}`}>
                                    <User className="h-3.5 w-3.5"/> {result.prAuthorLogin || 'N/A'}
                                </span>
                                <span className="flex items-center gap-1" title={`PR Created: ${result.prCreatedAt ? format(new Date(result.prCreatedAt), "PP") : 'N/A'}`}>
                                     <CalendarDays className="h-3.5 w-3.5"/> {result.prCreatedAt ? formatDistanceToNow(new Date(result.prCreatedAt), { addSuffix: true }) : 'N/A'}
                                </span>
                            </>
                        ) : result.searchResultType === 'repo_scan' ? (
                            <>
                                <span className="flex items-center gap-1" title={`Branch: ${result.scanBranch}`}>
                                    <GitBranch className="h-3.5 w-3.5"/> {result.scanBranch}
                                </span>
                                <span className="flex items-center gap-1" title={`Scan Date: ${result.scanCreatedAt ? format(new Date(result.scanCreatedAt), "PP") : 'N/A'}`}>
                                     <CalendarDays className="h-3.5 w-3.5"/> {result.scanCreatedAt ? formatDistanceToNow(new Date(result.scanCreatedAt), { addSuffix: true }) : 'N/A'}
                                </span>
                            </>
                        ) : null}
                    </div>
                    <div className="mt-2">
                        <p className="text-sm font-medium text-foreground mb-1">AI Insight for this file:</p>
                        <ScrollArea className="h-24 w-full rounded-md border bg-muted/30 p-2 shadow-inner">
                            <pre className="text-xs whitespace-pre-wrap text-muted-foreground font-mono">{result.aiInsights || "No specific AI insight recorded for this file."}</pre>
                        </ScrollArea>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-3 border-t flex justify-between items-center">
                     <Badge variant="secondary">Similarity: {(result.score * 100).toFixed(1)}%</Badge>
                     <Button variant="outline" size="sm" asChild>
                        {result.searchResultType === 'pr_analysis' && result.prNumber && result.analysisId ? (
                            <Link href={`/analyze/${result.owner}/${result.repoName}/${result.prNumber}/${result.analysisId}`} target="_blank" rel="noopener noreferrer">
                                <Lightbulb className="mr-1.5 h-4 w-4" /> View PR Analysis
                            </Link>
                        ) : result.searchResultType === 'repo_scan' && result.analysisId ? (
                             <Link href={`/analyze/${result.owner}/${result.repoName}/scan/${result.analysisId}`} target="_blank" rel="noopener noreferrer">
                                <Lightbulb className="mr-1.5 h-4 w-4" /> View Repo Scan
                            </Link>
                        ) : (<span className="opacity-50">No Link</span>) }
                     </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}
         {(!isLoading && queryText && searchResults.length === 0 && !error) && (
            <Card className="mt-8 text-center py-10 bg-muted/50">
                <CardContent>
                    <SearchCode className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-lg font-medium text-foreground">No Results Found</p>
                    <p className="text-sm text-muted-foreground">
                        Your search for "<span className="italic">{queryText.substring(0,50)}{queryText.length > 50 ? '...' : ''}</span>" did not match any similar code patterns from PRs or repository scans.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Ensure analyses have been run and try refining your query.</p>
                </CardContent>
            </Card>
        )}
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair. AI-Powered Code Insights.
        </div>
      </footer>
    </div>
  );
}
