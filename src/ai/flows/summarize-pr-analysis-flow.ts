
'use server';
/**
 * @fileOverview AI agent that summarizes the overall findings of a pull request analysis.
 *
 * - summarizePrAnalysis - A function that takes aggregated metrics and per-file insights to generate a holistic PR summary.
 * - SummarizePrAnalysisInput - The input type for the summarizePrAnalysis function.
 * - SummarizePrAnalysisOutput - The return type for the summarizePrAnalysis function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizePrAnalysisInputSchema = z.object({
  prTitle: z.string().describe('The title of the pull request.'),
  overallQualityScore: z.number().describe('The average quality score for the entire PR (1-10).'),
  totalCriticalIssues: z.number().describe('Total number of critical security issues found.'),
  totalHighIssues: z.number().describe('Total number of high-severity security issues found.'),
  totalSuggestions: z.number().describe('Total number of improvement suggestions offered.'),
  fileCount: z.number().describe('Number of files analyzed in this PR.'),
  perFileSummaries: z.array(z.object({
    filename: z.string(),
    insight: z.string().describe('The AI-generated summary for an individual file.'),
  })).describe('A list of summaries for each analyzed file. Use these to inform the overall PR summary.'),
});
export type SummarizePrAnalysisInput = z.infer<typeof SummarizePrAnalysisInputSchema>;

const SummarizePrAnalysisOutputSchema = z.object({
  prSummary: z.string().describe('A concise, holistic AI-generated summary for the entire pull request, highlighting key findings, overall quality, major risks, and top recommendations. Aim for 2-4 impactful sentences. Format this as a plain string, not Markdown initially.'),
});
export type SummarizePrAnalysisOutput = z.infer<typeof SummarizePrAnalysisOutputSchema>;

export async function summarizePrAnalysis(input: SummarizePrAnalysisInput): Promise<SummarizePrAnalysisOutput> {
  return summarizePrAnalysisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizePrAnalysisPrompt',
  input: {schema: SummarizePrAnalysisInputSchema},
  output: {schema: SummarizePrAnalysisOutputSchema},
  prompt: `You are an expert Code Review AI Lead. You have received analysis results for a pull request titled "{{prTitle}}".
Your task is to generate a concise, high-level summary for the *entire pull request*.

Key aggregated metrics for the PR:
- Overall Quality Score: {{overallQualityScore.toFixed(1)}}/10 (across {{fileCount}} files)
- Critical Security Issues: {{totalCriticalIssues}}
- High-Severity Security Issues: {{totalHighIssues}}
- Total Improvement Suggestions: {{totalSuggestions}}

Individual file insights (consider these for thematic summary):
{{#if perFileSummaries.length}}
{{#each perFileSummaries}}
- File: {{this.filename}}
  Insight: {{this.insight}}
{{/each}}
{{else}}
- No individual file insights were provided.
{{/if}}

Based on all the above, provide a holistic summary for the pull request.
Focus on:
1.  Overall code health and quality impression.
2.  The most significant risks or concerns (if any).
3.  Key positive aspects or important improvements made (if evident).
4.  A brief concluding remark or overall recommendation.

Make the summary concise (2-4 impactful sentences) and easy to understand for a developer or team lead.
Avoid simply restating the numbers; interpret them.
Example: "This PR introduces several valuable improvements but requires attention to X critical security vulnerabilities in Y and Z files. Overall quality is decent (7.5/10), though addressing the identified risks should be a priority before merging."
Another Example: "Excellent work on this PR! The changes are well-structured, leading to a high quality score (9.0/10) with no critical issues found across the {{fileCount}} analyzed files. This looks good to merge after reviewing minor suggestions."

Generate the prSummary.
`,
});

const summarizePrAnalysisFlow = ai.defineFlow(
  {
    name: 'summarizePrAnalysisFlow',
    inputSchema: SummarizePrAnalysisInputSchema,
    outputSchema: SummarizePrAnalysisOutputSchema,
  },
  async (input) => {
    // Potentially add pre-processing for perFileSummaries if they are too verbose for the prompt context window
    // For now, we pass them as is.
    const {output} = await prompt(input);
    return output!;
  }
);
