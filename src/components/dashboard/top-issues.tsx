
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { TopIssueItem, SecurityIssue, Suggestion } from "@/types";
import { AlertTriangle, Lightbulb, ListChecks } from "lucide-react";

interface TopIssuesProps {
  title: string;
  issues: TopIssueItem[];
  issueType: 'security' | 'suggestion';
}

export default function TopIssues({ title, issues, issueType }: TopIssuesProps) {
  
  const getSeverityBadgeVariant = (severity?: SecurityIssue['severity']) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive'; 
      case 'medium': return 'default'; 
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };
  
  const getPriorityBadgeVariant = (priority?: Suggestion['priority']) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default'; 
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const Icon = issueType === 'security' ? AlertTriangle : Lightbulb;

  return (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold font-headline flex items-center">
          <Icon className={`mr-2 h-6 w-6 ${issueType === 'security' ? 'text-destructive' : 'text-accent'}`} />
          {title}
        </CardTitle>
        <CardDescription>Most frequently occurring {issueType === 'security' ? 'security problems' : 'improvement suggestions'} across your analyses.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <ListChecks className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No common {issueType === 'security' ? 'security issues' : 'suggestions'} identified yet.</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px] pr-3">
            <ul className="space-y-3">
              {issues.map((issue, index) => (
                <li key={index} className="p-3 border rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-sm text-foreground truncate pr-2 flex-grow" title={issue.title}>{issue.title}</span>
                    <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                      {issue.count} {issue.count === 1 ? 'occurrence' : 'occurrences'}
                    </Badge>
                  </div>
                  {(issue.severity || issue.priority || issue.type) && (
                    <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                      {issueType === 'security' && issue.severity && (
                        <Badge variant={getSeverityBadgeVariant(issue.severity as SecurityIssue['severity'])} className="text-xs capitalize">
                          {issue.severity}
                        </Badge>
                      )}
                      {issueType === 'suggestion' && issue.priority && (
                         <Badge variant={getPriorityBadgeVariant(issue.priority as Suggestion['priority'])} className="text-xs capitalize">
                          {issue.priority} priority
                        </Badge>
                      )}
                       {issue.type && (
                         <Badge variant="outline" className="text-xs capitalize">
                          {(issue.type as string).replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

