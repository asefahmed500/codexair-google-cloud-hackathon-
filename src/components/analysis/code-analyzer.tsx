import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CodeAnalysis } from "@/types";

interface CodeAnalyzerProps {
  analysis: CodeAnalysis | null;
}

export default function CodeAnalyzer({ analysis }: CodeAnalyzerProps) {
  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Code Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No analysis data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code Analysis Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold">Overall Quality Score</h3>
          <p className="text-2xl font-bold text-primary">{analysis.qualityScore.toFixed(1)} / 10</p>
        </div>
        <div>
          <h3 className="font-semibold">Complexity</h3>
          <p>{analysis.complexity.toFixed(1)}</p>
        </div>
        <div>
          <h3 className="font-semibold">Maintainability</h3>
          <p>{analysis.maintainability.toFixed(1)}</p>
        </div>
        <div>
          <h3 className="font-semibold">AI Insights</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{analysis.aiInsights}</p>
        </div>
      </CardContent>
    </Card>
  );
}
