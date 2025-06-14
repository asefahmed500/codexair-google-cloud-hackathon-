
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, RefreshCw, AlertTriangle, Terminal, ScrollText, FileCode, MessageSquareQuote } from 'lucide-react'; // Changed MessageSquareQuestion to MessageSquareQuote
import { toast } from '@/hooks/use-toast';
import type { ExplainCodeOutput } from '@/ai/flows/explain-code-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

const predefinedQuestions = [
  { value: "What does this code do?", label: "What does this code do?" },
  { value: "Is this good practice and why or why not?", label: "Is this good practice and why/why not?" },
  { value: "How can this code be improved for performance?", label: "How can this code be improved for performance?" },
  { value: "How can this code be improved for readability?", label: "How can this code be improved for readability?" },
  { value: "Explain the potential security risks in this code.", label: "Explain potential security risks." },
  { value: "What is the time and space complexity of this code?", label: "What is the time and space complexity?"}
];

export default function ExplainCodePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(predefinedQuestions[0].value);
  const [customQuestion, setCustomQuestion] = useState('');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);


  if (status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="max-w-3xl mx-auto shadow-lg">
            <CardHeader>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <Skeleton className="h-24 w-full" /> {/* Textarea */}
              <Skeleton className="h-10 w-full" /> {/* Language Input */}
              <Skeleton className="h-10 w-full" /> {/* Question Select */}
              <Skeleton className="h-10 w-full" /> {/* Custom Question Input */}
              <Skeleton className="h-10 w-full" /> {/* Button */}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  if (status === 'unauthenticated') return null; // Already handled by useEffect, but good for safety

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast({ title: "Input Required", description: "Please enter some code to explain.", variant: "destructive" });
      return;
    }

    const finalQuestion = customQuestion.trim() !== '' ? customQuestion.trim() : selectedQuestion;

    if (!finalQuestion) {
      toast({ title: "Question Required", description: "Please select a predefined question or type your own.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);
    setExplanation(null);

    try {
      const response = await fetch('/api/ai/explain-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: language || undefined, question: finalQuestion }),
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
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="max-w-3xl mx-auto shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold font-headline flex items-center">
              <ScrollText className="mr-3 h-8 w-8 text-primary" />
              Explain My Code
            </CardTitle>
            <CardDescription>
              Paste your code snippet, select a language (optional), choose a question or type your own, and let AI provide an explanation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor="code-input" className="flex items-center text-sm font-medium text-foreground mb-1.5">
                <FileCode className="mr-2 h-4 w-4 text-muted-foreground" />
                Code Snippet
              </label>
              <Textarea
                id="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your code here..."
                rows={10}
                className="font-mono text-sm bg-background shadow-inner focus:ring-primary/50"
              />
            </div>
             <div>
              <label htmlFor="language-input" className="flex items-center text-sm font-medium text-foreground mb-1.5">
                <Terminal className="mr-2 h-4 w-4 text-muted-foreground" />
                Programming Language (Optional)
              </label>
               <Input
                type="text"
                id="language-input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g., javascript, python, java (AI will infer if left blank)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-primary/50"
              />
            </div>
            <div>
              <label htmlFor="question-select" className="flex items-center text-sm font-medium text-foreground mb-1.5">
                <MessageSquareQuote className="mr-2 h-4 w-4 text-muted-foreground" /> {/* Changed MessageSquareQuestion to MessageSquareQuote */}
                Predefined Question
              </label>
              <Select value={selectedQuestion} onValueChange={setSelectedQuestion} disabled={customQuestion.trim() !== ''}>
                <SelectTrigger id="question-select" className="focus:ring-primary/50">
                  <SelectValue placeholder="Select a common question" />
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
            <div>
              <label htmlFor="custom-question-input" className="block text-sm font-medium text-foreground mb-1.5">
                Or Type Your Own Question
              </label>
              <Input
                id="custom-question-input"
                type="text"
                value={customQuestion}
                onChange={(e) => {
                  setCustomQuestion(e.target.value);
                }}
                placeholder="e.g., How does this function handle edge cases?"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-primary/50"
              />
               {customQuestion.trim() !== '' && (
                <p className="text-xs text-muted-foreground mt-1.5">Using custom question. Predefined selection is ignored.</p>
              )}
            </div>
            <Button onClick={handleSubmit} disabled={isLoading || !code.trim()} className="w-full shadow-md hover:shadow-lg transition-shadow text-base py-3">
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Getting Explanation...
                </>
              ) : (
                <>
                  <Lightbulb className="mr-2 h-5 w-5" />
                  Explain Code
                </>
              )}
            </Button>
          </CardContent>
          
          {error && (
             <CardFooter className="flex-col items-start pt-2 pb-4">
                <Alert variant="destructive" className="w-full">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
             </CardFooter>
          )}

          {explanation && !isLoading && (
            <CardFooter className="pt-4 pb-6 flex-col items-start">
              <Card className="w-full bg-muted/30 shadow-inner">
                <CardHeader>
                  <CardTitle className="text-xl sm:text-2xl font-semibold flex items-center">
                    <Lightbulb className="mr-2 h-6 w-6 text-accent" />
                    AI Explanation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-auto max-h-[30rem] w-full rounded-md border bg-background p-4 shadow">
                     <pre className="text-sm whitespace-pre-wrap font-mono text-foreground">{explanation}</pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </CardFooter>
          )}
        </Card>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair. AI-Powered Code Insights.
        </div>
      </footer>
    </div>
  );
}


