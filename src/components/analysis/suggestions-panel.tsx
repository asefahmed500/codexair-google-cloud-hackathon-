import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { Suggestion } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
}

export default function SuggestionsPanel({ suggestions }: SuggestionsPanelProps) {
  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Improvement Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No specific suggestions available at this time.</p>
        </CardContent>
      </Card>
    );
  }
  
  const getPriorityBadgeVariant = (priority: Suggestion['priority']) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Improvement Suggestions ({suggestions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {suggestions.map((suggestion, index) => (
            <AccordionItem value={`suggestion-${index}`} key={index}>
              <AccordionTrigger>
                <div className="flex justify-between items-center w-full">
                  <span className="text-left">{suggestion.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{suggestion.type}</Badge>
                    <Badge variant={getPriorityBadgeVariant(suggestion.priority)}>{suggestion.priority}</Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p><strong className="font-medium">Description:</strong> {suggestion.description}</p>
                <p><strong className="font-medium">File:</strong> {suggestion.file}:{suggestion.line || 'N/A'}</p>
                {suggestion.codeExample && (
                  <div>
                    <strong className="font-medium">Code Example:</strong>
                    <ScrollArea className="max-h-40 mt-1 rounded-md border bg-muted p-2">
                      <pre className="text-sm font-code whitespace-pre-wrap">{suggestion.codeExample}</pre>
                    </ScrollArea>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
