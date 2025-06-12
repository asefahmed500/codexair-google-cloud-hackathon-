
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, RefreshCw, AlertTriangle, Terminal } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { ExplainCodeOutput } from '@/ai/flows/explain-code-flow';

const predefinedQuestions = [
  { value: "What does this code do?", label: "What does this code do?" },
  { value: "Is this good practice and why or why not?", label: "Is this good practice and why/why not?" },
  { value: "How can this code be improved for performance?", label: "How can this code be improved for performance?" },
  { value: "How can this code be improved for readability?", label: "How can this code be improved for readability?" },
  { value: "Explain the potential security risks in this code.", label: "Explain potential security risks." },
];

export default function ExplainCodePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [language, setLanguage] = useState(''); // Optional language input
  const [selectedQuestion, setSelectedQuestion] = useState(predefinedQuestions[0].value);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') {
    return <div className="flex flex-col min-h-screen"><Navbar /><div className="flex-1 flex items-center justify-center">Loading session...</div></div>;
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast({ title: "Input Required", description: "Please enter some code to explain.", variant: "destructive" });
      return;
    }
    if (!selectedQuestion) {
      toast({ title: "Question Required", description: "Please select a question.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);
    setExplanation(null);

    try {
      const response = await fetch('/api/ai/explain-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: language || undefined, question: selectedQuestion }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Failed to get explanation');
      }
      
      setExplanation((result as ExplainCodeOutput).explanation);
      toast({ title: "Explanation Received", description: "AI has provided an explanation." });

    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <Card className="max-w-3xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold font-headline flex items-center">
              <Lightbulb className="mr-3 h-8 w-8 text-primary" />
              Explain My Code
            </CardTitle>
            <CardDescription>
              Paste your code snippet, select a question, and let AI provide an explanation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor="code-input" className="block text-sm font-medium text-foreground mb-1">
                Code Snippet
              </label>
              <Textarea
                id="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your code here..."
                rows={10}
                className="font-mono text-sm bg-background shadow-inner"
              />
            </div>
             <div>
              <label htmlFor="language-input" className="block text-sm font-medium text-foreground mb-1">
                Programming Language (Optional)
              </label>
               <input
                type="text"
                id="language-input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g., javascript, python, java (AI will infer if blank)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="question-select" className="block text-sm font-medium text-foreground mb-1">
                Your Question
              </label>
              <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
                <SelectTrigger id="question-select">
                  <SelectValue placeholder="Select a question" />
                </SelectTrigger>
                <SelectContent>
                  {predefinedQuestions.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSubmit} disabled={isLoading || !code.trim()} className="w-full shadow-md">
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Getting Explanation...
                </>
              ) : (
                <>
                  <Terminal className="mr-2 h-4 w-4" />
                  Explain Code
                </>
              )}
            </Button>
          </CardContent>
          
          {error && (
             <CardFooter>
                <Alert variant="destructive" className="w-full">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
             </CardFooter>
          )}

          {explanation && !isLoading && (
            <CardFooter className="pt-0">
              <Card className="w-full bg-muted/30 shadow-inner">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center">
                    <Lightbulb className="mr-2 h-5 w-5 text-accent" />
                    AI Explanation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-auto max-h-96 w-full rounded-md border bg-background p-4 shadow">
                     <pre className="text-sm whitespace-pre-wrap font-mono text-foreground">{explanation}</pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </CardFooter>
          )}
        </Card>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair. AI-Powered Code Insights.
        </div>
      </footer>
    </div>
  );
}
