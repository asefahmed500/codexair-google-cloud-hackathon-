import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { SecurityIssue } from "@/types";

interface SecurityScannerProps {
  issues: SecurityIssue[];
}

export default function SecurityScanner({ issues }: SecurityScannerProps) {
  if (!issues || issues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Security Scan Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No security issues found.</p>
        </CardContent>
      </Card>
    );
  }

  const getSeverityBadgeVariant = (severity: SecurityIssue['severity']) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive'; // Or a specific "high" variant
      case 'medium': return 'default'; // Should be an orange/yellow
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Issues ({issues.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {issues.map((issue, index) => (
            <AccordionItem value={`issue-${index}`} key={index}>
              <AccordionTrigger>
                <div className="flex justify-between items-center w-full">
                  <span>{issue.title}</span>
                  <Badge variant={getSeverityBadgeVariant(issue.severity)}>{issue.severity}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-1">
                <p><strong className="font-medium">Description:</strong> {issue.description}</p>
                <p><strong className="font-medium">File:</strong> {issue.file}:{issue.line || 'N/A'}</p>
                <p><strong className="font-medium">Suggestion:</strong> {issue.suggestion}</p>
                {issue.cwe && <p><strong className="font-medium">CWE:</strong> {issue.cwe}</p>}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
