
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
    insight: z.string().describe('The AI-generated summary for an individual file. This insight is typically a few sentences long, in a format like "## AI Review Summary\\n✅ [score]/10 quality score\\n⚠️ [X] Critical Issues ([types])\\n💡 [Y] Optimizations Available". Use these to inform the overall PR summary by identifying themes or critical points.'),
  })).describe('A list of summaries for each analyzed file. Use these to inform the overall PR summary.'),
});
export type SummarizePrAnalysisInput = z.infer<typeof SummarizePrAnalysisInputSchema>;

const SummarizePrAnalysisOutputSchema = z.object({
  prSummary: z.string().describe('A concise, holistic AI-generated summary for the entire pull request, highlighting key findings, overall quality, major risks, and top recommendations. Aim for 2-4 impactful sentences. Format this as a plain string, not Markdown initially. This summary should provide a narrative-level explanation to help developers understand what to prioritize.'),
});
export type SummarizePrAnalysisOutput = z.infer<typeof SummarizePrAnalysisOutputSchema>;

export async function summarizePrAnalysis(input: SummarizePrAnalysisInput): Promise<SummarizePrAnalysisOutput> {
  return summarizePrAnalysisFlow(input);
}

// Define a schema for the actual data structure being passed to the prompt's template
const SummarizePrAnalysisPromptContextSchema = SummarizePrAnalysisInputSchema.extend({
  formattedOverallQualityScore: z.string(),
});

const prompt = ai.definePrompt({
  name: 'summarizePrAnalysisPrompt',
  // The input schema for the prompt definition should match what the template expects.
  // However, the flow itself receives SummarizePrAnalysisInput.
  // The 'input' to `prompt()` call within the flow will be an object satisfying SummarizePrAnalysisPromptContextSchema.
  input: {schema: SummarizePrAnalysisPromptContextSchema}, 
  output: {schema: SummarizePrAnalysisOutputSchema},
  prompt: `You are an expert Code Review AI Lead. You have received analysis results for a pull request titled "{{prTitle}}".
Your task is to generate a concise, high-level summary for the *entire pull request*. This summary should be a narrative explanation that helps developers understand what to prioritize.

Key aggregated metrics for the PR:
- Overall Quality Score: {{formattedOverallQualityScore}}/10 (across {{fileCount}} files)
- Critical Security Issues: {{totalCriticalIssues}}
- High-Severity Security Issues: {{totalHighIssues}}
- Total Improvement Suggestions: {{totalSuggestions}}

Individual file insights (consider these for thematic summary, common issues, or critical file-specific problems):
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
1.  **Overall code health and quality impression:** Start with a general statement about the PR's quality based on the score.
2.  **The most significant risks or concerns:** Clearly state if there are critical/high security issues and in which files if they are particularly notable.
3.  **Key positive aspects or important improvements made:** If evident from the data or file insights.
4.  **A brief concluding remark or overall recommendation:** What should the developer prioritize? Is it ready for merge after fixes, or does it need more significant work?

Make the summary concise (2-4 impactful sentences) and easy to understand for a developer or team lead.
Avoid simply restating the numbers; *interpret* them into a narrative.
Example 1 (issues present): "This PR introduces several valuable improvements but requires immediate attention to {{totalCriticalIssues}} critical security vulnerabilities, notably in {{#if perFileSummaries.[0]}}{{perFileSummaries.[0].filename}}{{else}}key files{{/if}}. Overall quality is {{formattedOverallQualityScore}}/10. Prioritize addressing the identified security risks before merging."
Example 2 (good quality): "Excellent work on this PR! The changes are well-structured, leading to a high quality score of {{formattedOverallQualityScore}}/10 with no critical issues found across the {{fileCount}} analyzed files. This looks good to merge after reviewing the {{totalSuggestions}} minor suggestions."
Example 3 (mixed): "The PR achieves its main goals with an average quality score of {{formattedOverallQualityScore}}/10. While there are no critical security issues, address the {{totalHighIssues}} high-severity warnings and review the {{totalSuggestions}} suggestions for maintainability, particularly in files like {{#if perFileSummaries.[0]}}{{perFileSummaries.[0].filename}}{{/if}}."

Generate the prSummary. Ensure it is a narrative explanation suitable for display at the top of a detailed analysis view.
`,
});

const summarizePrAnalysisFlow = ai.defineFlow(
  {
    name: 'summarizePrAnalysisFlow',
    inputSchema: SummarizePrAnalysisInputSchema, // Flow input remains the original schema
    outputSchema: SummarizePrAnalysisOutputSchema,
  },
  async (input) => {
    // Create the context object for the prompt, including the formatted score
    const promptContext = {
      ...input,
      formattedOverallQualityScore: input.overallQualityScore.toFixed(1),
    };
    
    const {output} = await prompt(promptContext); // Pass the extended context to the prompt
    if (!output || !output.prSummary || output.prSummary.trim() === "") {
        console.warn("[summarizePrAnalysisFlow] AI failed to generate a summary. Falling back.");
        return { prSummary: FALLBACK_SUMMARY_MESSAGE };
    }
    return output!;
  }
);

const FALLBACK_SUMMARY_MESSAGE = "Overall analysis summary could not be generated for this pull request.";

