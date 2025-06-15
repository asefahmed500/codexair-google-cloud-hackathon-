
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import type { Repository as RepoType } from '@/types';
import { Github, Eye, RefreshCw, Search, Star, Lock, Unlock, ChevronLeft, ChevronRight, Info, GitPullRequest } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Navbar from '@/components/layout/navbar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function AnalyzePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repositories, setRepositories] = useState<RepoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);

  const ITEMS_PER_PAGE = 9; // Display 9 repos per page (3x3 grid)

  const fetchRepositories = useCallback(async (page = 1, sync = false) => {
    if (sync) {
      setIsSyncing(true);
      toast({ title: "Syncing Repositories...", description: "Fetching latest data from GitHub. This may take a moment." });
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // For sync, page requested to API is always 1, as API handles fetching multiple GH pages
      // and returns page 1 of local DB.
      // For non-sync, page is passed as is.
      const apiPage = sync ? 1 : page;
      const response = await fetch(`/api/repositories?page=${apiPage}&limit=${ITEMS_PER_PAGE}&sync=${sync}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }
      const data = await response.json();
      setRepositories(data.repositories || []);
      setCurrentPage(data.currentPage || 1); // API returns current page (1 after sync)
      setTotalPages(data.totalPages || 1);

      if (sync) toast({ title: "Repositories Synced", description: `Fetched your most recently updated repositories from GitHub. Displaying page ${data.currentPage || 1}.` });
      
    } catch (err: any) {
      setError(err.message);
      setRepositories([]); 
      setCurrentPage(1);
      setTotalPages(1);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      if (sync) setIsSyncing(false);
      else setLoading(false);
    }
  }, [ITEMS_PER_PAGE]); 
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchRepositories(currentPage);
    }
  }, [status, router, currentPage, fetchRepositories]); 

  const handleSync = () => {
    // setCurrentPage(1); // fetchRepositories with sync=true will effectively reset to page 1 of local DB
    fetchRepositories(1, true);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage && !loading && !isSyncing) {
      setCurrentPage(newPage);
    }
  };

  const filteredRepositories = repositories.filter(repo =>
    repo.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (repo.language && repo.language.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <CardTitle className="text-2xl sm:text-3xl font-bold font-headline flex items-center">
                      <GitPullRequest className="h-7 w-7 sm:h-8 sm:w-8 text-primary mr-2" />
                      Analyze Repository Pull Requests
                    </CardTitle>
                    <CardDescription>
                      Select a synced repository to view its pull requests. Then, you can initiate AI-powered code analysis on individual PRs.
                      Use "Sync Repositories" to update this list with your most recently active GitHub repositories.
                    </CardDescription>
                </div>
                <Button 
                    variant="outline" 
                    className="w-full sm:w-auto" 
                    onClick={handleSync} 
                    disabled={isSyncing || loading}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing && 'animate-spin'}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Repositories'}
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search synced repositories by name or language..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={loading || isSyncing}
                />
              </div>
            </div>

            {loading && !repositories.length && !isSyncing ? ( 
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(ITEMS_PER_PAGE)].map((_, i) => (
                  <SkeletonRepoCard key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center text-center py-10 bg-muted/30 rounded-md">
                <Info className="w-12 h-12 text-destructive mb-3" />
                <p className="text-lg font-semibold text-destructive">Failed to load repositories</p>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={() => fetchRepositories(currentPage)} variant="outline">Try Again</Button>
              </div>
            ) : filteredRepositories.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 bg-muted/30 rounded-md">
                <Github className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-lg font-semibold text-foreground">
                    {searchTerm ? "No synced repositories match your search." : "No repositories synced yet."}
                </p>
                <p className="text-muted-foreground mb-4">
                    {searchTerm ? "Try a different search term or clear your search." : 'Try syncing with GitHub to see your repositories here. This will fetch your most recently updated repos.'}
                </p>
                {searchTerm && <Button onClick={() => setSearchTerm('')} variant="outline" className="mr-2">Clear Search</Button>}
                {!searchTerm && <Button onClick={handleSync} disabled={isSyncing || loading} variant="default">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing && 'animate-spin'}`} /> Sync Now
                </Button>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRepositories.map(repo => (
                  <Card key={repo._id} className="hover:shadow-xl transition-all duration-300 ease-in-out flex flex-col bg-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <Github className="h-5 w-5 text-primary flex-shrink-0" />
                            <CardTitle className="text-lg md:text-xl font-semibold truncate hover:text-primary transition-colors">
                                <Link href={`/analyze/${repo.owner}/${repo.name}`} title={repo.fullName}>
                                    {repo.fullName}
                                </Link>
                            </CardTitle>
                        </div>
                        <Badge variant={repo.isPrivate ? "default" : "secondary"} className={`text-xs ${repo.isPrivate ? 'bg-foreground text-background' : ''}`}>
                            {repo.isPrivate ? <Lock className="mr-1 h-3 w-3" /> : <Unlock className="mr-1 h-3 w-3" />}
                            {repo.isPrivate ? 'Private' : 'Public'}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-muted-foreground">
                        Last updated: {new Date(repo.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground flex-grow">
                      {repo.language && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-accent"></div> {/* Placeholder for language color dot */}
                          <span>{repo.language}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-yellow-500" /> <span>{repo.stars} Stars</span>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-3 border-t">
                      <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                        <Link href={`/analyze/${repo.owner}/${repo.name}`}>
                          <Eye className="mr-2 h-4 w-4" /> View Pull Requests
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
            
            {totalPages > 1 && filteredRepositories.length > 0 && (
              <div className="mt-8 flex justify-center items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading || isSyncing}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm text-muted-foreground font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || loading || isSyncing}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
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

function SkeletonRepoCard() {
    return (
      <Card className="animate-pulse flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 w-3/4">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-6 w-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-2 flex-grow">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </CardContent>
        <CardFooter className="pt-3 border-t">
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    )
}
