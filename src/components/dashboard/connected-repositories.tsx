
'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConnectedRepositoryItem } from "@/types";
import { Github, GitFork, Eye, Star, Terminal } from "lucide-react"; // Added Terminal for Language
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '../ui/badge';

interface ConnectedRepositoriesProps {
  repositories: ConnectedRepositoryItem[];
}

export default function ConnectedRepositories({ repositories }: ConnectedRepositoriesProps) {
  return (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-2xl font-semibold font-headline flex items-center">
            <GitFork className="mr-2 h-6 w-6 text-primary" />
            Connected Repositories
          </CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/analyze">Manage Repositories</Link>
          </Button>
        </div>
        <CardDescription>Your recently synced or updated repositories. Go to "Manage Repositories" to sync more.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {repositories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Github className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No repositories synced yet.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/analyze">Sync your first repository</Link>
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-3"> {/* Adjusted height */}
            <div className="space-y-3">
              {repositories.map((repo) => (
                <div key={repo._id} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-grow overflow-hidden">
                      <h3 className="font-semibold text-md text-foreground truncate" title={repo.fullName}>
                        <Link href={`/analyze/${repo.owner}/${repo.name}`} className="hover:underline flex items-center gap-1.5">
                           <Github className="h-4 w-4 flex-shrink-0" /> {repo.fullName}
                        </Link>
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        {repo.language && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                                <Terminal className="h-3 w-3" /> {repo.language}
                            </Badge>
                        )}
                        <span>
                          Updated {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="ml-2 flex-shrink-0">
                      <Link href={`/analyze/${repo.owner}/${repo.name}`}>
                        <Eye className="mr-1.5 h-4 w-4" /> View PRs
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
