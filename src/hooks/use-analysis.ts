'use client';

import { useState, useCallback } from 'react';
import type { CodeAnalysis, PullRequest } from '@/types'; // Assuming types
import { toast } from './use-toast'; // Assuming useToast hook exists

export function useAnalysis() {
  const [analysisResult, setAnalysisResult] = useState<CodeAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startPullRequestAnalysis = useCallback(async (owner: string, repoName: string, pullNumber: number) => {
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ owner, repoName, pullNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to start analysis');
      }
      const data: { analysis: CodeAnalysis, pullRequest: PullRequest } = await response.json();
      setAnalysisResult(data.analysis);
      toast({
        title: "Analysis Complete",
        description: `Analysis for PR #${pullNumber} in ${owner}/${repoName} is complete.`,
      });
      return data; // Return both analysis and PR data
    } catch (e: any) {
      setError(e);
      toast({
        title: "Analysis Error",
        description: e.message || "An unknown error occurred during analysis.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const fetchAnalysisById = useCallback(async (analysisId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/analysis-results/${analysisId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to fetch analysis results');
      }
      const data: { analysis: CodeAnalysis, pullRequest: PullRequest } = await response.json();
      setAnalysisResult(data.analysis);
      return data;
    } catch (e: any) {
      setError(e);
      toast({
        title: "Fetch Error",
        description: e.message || "Could not load analysis data.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);


  return { analysisResult, isLoading, error, startPullRequestAnalysis, fetchAnalysisById };
}
