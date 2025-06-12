
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TeamMemberMetric } from "@/types";
import { Users, TrendingUp, AlertCircle } from "lucide-react";

interface TeamMetricsProps {
  metrics: TeamMemberMetric[];
}

export default function TeamMetrics({ metrics }: TeamMetricsProps) {
  return (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold font-headline flex items-center">
          <Users className="mr-2 h-6 w-6 text-primary" />
          Team Metrics
        </CardTitle>
        <CardDescription>Overview of team contributions and code quality.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {metrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Users className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No team metrics available yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Analyze pull requests to see team data.</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Contributor</TableHead>
                  <TableHead className="text-center">Analyses</TableHead>
                  <TableHead className="text-center">Avg. Quality</TableHead>
                  <TableHead className="text-center">Crit/High Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.userAvatar} alt={member.userName} />
                          <AvatarFallback>{member.userName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate" title={member.userName}>{member.userName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{member.totalAnalyses}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-semibold ${member.avgQualityScore >= 7 ? 'text-green-600' : member.avgQualityScore >= 4 ? 'text-amber-600' : 'text-destructive'}`}>
                        {member.avgQualityScore.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                        <span className={`${(member.totalCriticalIssues + member.totalHighIssues) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                            {member.totalCriticalIssues + member.totalHighIssues}
                        </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
