
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import type { Repository as RepoType } from '@/types';
import { Github, Eye, RefreshCw, Search, Star, Lock, Unlock, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Navbar from '@/components/layout/navbar'; 
import { Skeleton } from '@/components/ui/skeleton';

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

  const fetchRepositories = useCallback(async (page = 1, sync = false) => {
    if (sync) {
      setIsSyncing(true);
      toast({ title: "Syncing Repositories...", description: "Fetching latest data from GitHub. This may take a moment." });
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/repositories?page=${page}&limit=10&sync=${sync}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }
      const data = await response.json();
      setRepositories(data.repositories || []);
      setCurrentPage(data.currentPage || 1);
      setTotalPages(data.totalPages || 1);

      if (sync) toast({ title: "Repositories Synced", description: `Fetched page ${data.currentPage || 1} of repositories from GitHub.` });
      
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
  }, []); 
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchRepositories(currentPage);
    }
  }, [status, router, currentPage, fetchRepositories]); 

  const handleSync = () => {
    setCurrentPage(1); 
    fetchRepositories(1, true);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
    }
  };

  const filteredRepositories = repositories.filter(repo =>
    repo.fullName.toLowerCase().includes(searchTerm.toLowerCase())
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
                    <CardTitle className="text-2xl sm:text-3xl font-bold font-headline">Analyze Repository</CardTitle>
                    <CardDescription>Select a repository to view its pull requests and initiate AI-powered code analysis. Click "Sync Repositories" to fetch your latest repositories from GitHub.</CardDescription>
                </div>
                <Button variant="outline" className="w-full sm:w-auto" onClick={handleSync} disabled={isSyncing || loading}>
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
                  placeholder="Search synced repositories..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {loading && !repositories.length && !isSyncing ? ( 
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <SkeletonRepoCard key={i} />
                ))}
              </div>
            ) : error ? (
              <p className="text-destructive text-center py-8">{error}</p>
            ) : filteredRepositories.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {searchTerm ? "No repositories match your search." : "No repositories found. Try syncing with GitHub."}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRepositories.map(repo => (
                  <Card key={repo._id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-lg md:text-xl flex items-center gap-2">
                        <Github className="h-5 w-5 text-primary" />
                        {repo.fullName}
                      </CardTitle>
                      <CardDescription>Language: {repo.language || 'N/A'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4" /> {repo.stars} Stars
                      </div>
                      <div className="flex items-center gap-1.5">
                        {repo.isPrivate ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        {repo.isPrivate ? 'Private' : 'Public'}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button asChild className="w-full">
                        <Link href={`/analyze/${repo.owner}/${repo.name}`}>
                          <Eye className="mr-2 h-4 w-4" /> View Pull Requests
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
            
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading || isSyncing}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || loading || isSyncing}
                >
                  <ChevronRight className="h-4 w-4" />
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
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    )
}
