
'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RecentAnalysisItem } from "@/types";
import { Eye, GitPullRequest, ShieldAlert, CheckCircle2, ScanSearch, GitBranch, Hash } from "lucide-react"; // Added ScanSearch, GitBranch
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface RecentReviewsProps {
  reviews: RecentAnalysisItem[];
}

export default function RecentReviews({ reviews }: RecentReviewsProps) {
  return (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold font-headline">Recent Activity</CardTitle>
        <CardDescription>Quick overview of the latest code analyses (PRs & Repository Scans).</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <GitPullRequest className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No recent analyses found.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/analyze">Start your first analysis</Link>
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[350px] pr-3">
            <div className="space-y-4">
              {reviews.map((review) => {
                const isPrAnalysis = review.type === 'pr';
                let title: string;
                let linkHref: string | null = null;
                let repoContext: string;

                if (isPrAnalysis) {
                  title = review.pullRequestTitle || `PR #${review.prNumber || 'N/A'}`;
                  repoContext = review.repositoryName && review.repositoryName !== 'N/A'
                                ? `in ${review.repositoryName}`
                                : (review.prNumber ? `PR #${review.prNumber}` : 'N/A');
                  if (review.owner && review.owner !== 'N/A' && review.repo && review.repo !== 'N/A' && review.prNumber && review.id) {
                    linkHref = `/analyze/${review.owner}/${review.repo}/${review.prNumber}/${review.id}`;
                  }
                } else { // Repo Scan
                  title = `Scan: ${review.repositoryName}`;
                  repoContext = review.branchAnalyzed ? `Branch: ${review.branchAnalyzed}` : `Commit: ${review.commitShaAnalyzed || 'N/A'}`;
                  if (review.owner && review.owner !== 'N/A' && review.repo && review.repo !== 'N/A' && review.id) {
                    linkHref = `/analyze/${review.owner}/${review.repo}/scan/${review.id}`;
                  }
                }
                
                return (
                  <div key={review.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-md text-foreground truncate max-w-[200px] sm:max-w-xs" title={title}>
                          {linkHref ? (
                             <Link href={linkHref} className="hover:underline flex items-center gap-1.5">
                               {isPrAnalysis ? <GitPullRequest className="h-4 w-4 text-primary" /> : <ScanSearch className="h-4 w-4 text-primary" />}
                               {title}
                             </Link>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              {isPrAnalysis ? <GitPullRequest className="h-4 w-4" /> : <ScanSearch className="h-4 w-4" />}
                              {title}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {repoContext}
                        </p>
                      </div>
                      {linkHref && (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={linkHref}>
                            <Eye className="mr-1.5 h-4 w-4" /> View
                          </Link>
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1">
                        {review.qualityScore >= 7 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
                        <span>Quality: {review.qualityScore.toFixed(1)}/10</span>
                      </div>
                      <Badge variant={review.securityIssues > 0 ? "destructive" : "secondary"} className="text-xs">
                        {review.securityIssues} Crit/High
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {review.createdAt ? formatDistanceToNow(new Date(review.createdAt), { addSuffix: true }) : 'Date N/A'}
                    </p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
