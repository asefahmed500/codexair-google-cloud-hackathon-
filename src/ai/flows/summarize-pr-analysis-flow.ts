
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
  prTitle: z.string().describe('The title of the pull request or context of the scan (e.g., "Repo Scan: owner/repo branch").'),
  overallQualityScore: z.number().describe('The average quality score for the entire PR/scan (1-10).'),
  totalCriticalIssues: z.number().describe('Total number of critical security issues found.'),
  totalHighIssues: z.number().describe('Total number of high-severity security issues found.'),
  totalSuggestions: z.number().describe('Total number of improvement suggestions offered.'),
  fileCount: z.number().describe('Number of files analyzed in this PR/scan.'),
  perFileSummaries: z.array(z.object({
    filename: z.string(),
    insight: z.string().describe('The AI-generated summary for an individual file. This insight is typically a few sentences long, in a format like "## AI Review Summary\\n✅ [score]/10 quality score\\n⚠️ [X] Critical Issues ([types])\\n💡 [Y] Optimizations Available". Use these to inform the overall PR summary by identifying themes or critical points.'),
  })).describe('A list of summaries for each analyzed file. Use these to inform the overall PR summary.'),
  tldrMode: z.boolean().optional().default(false).describe('If true, generate a concise bullet-point summary of up to 3 key issues or takeaways. Otherwise, generate a detailed narrative summary.'),
});
export type SummarizePrAnalysisInput = z.infer<typeof SummarizePrAnalysisInputSchema>;

const SummarizePrAnalysisOutputSchema = z.object({
  prSummary: z.string().describe('The AI-generated summary. Content varies based on tldrMode. For detailed mode: concise, holistic summary for the entire pull request/scan, highlighting key findings, overall quality, major risks, and top recommendations (2-4 impactful sentences). For TL;DR mode: up to 3 bullet points of critical issues/takeaways, or "No major critical issues identified." if applicable.'),
});
export type SummarizePrAnalysisOutput = z.infer<typeof SummarizePrAnalysisOutputSchema>;

export async function summarizePrAnalysis(input: SummarizePrAnalysisInput): Promise<SummarizePrAnalysisOutput> {
  return summarizePrAnalysisFlow(input);
}

// Define a schema for the actual data structure being passed to the prompt's template
const SummarizePrAnalysisPromptContextSchema = SummarizePrAnalysisInputSchema.extend({
  formattedOverallQualityScore: z.string(),
  // This field will be populated with the actual prompt content before calling the LLM
  effectivePromptInstructions: z.string(),
});

const DETAILED_SUMMARY_INSTRUCTIONS = `
Based on all the above, provide a holistic summary for the pull request/scan.
Focus on:
1.  **Overall code health and quality impression:** Start with a general statement about the quality based on the score.
2.  **The most significant risks or concerns:** Clearly state if there are critical/high security issues and in which files if they are particularly notable.
3.  **Key positive aspects or important improvements made:** If evident from the data or file insights.
4.  **A brief concluding remark or overall recommendation:** What should the developer prioritize? Is it ready for merge after fixes, or does it need more significant work?

Make the summary concise (2-4 impactful sentences) and easy to understand for a developer or team lead.
Avoid simply restating the numbers; *interpret* them into a narrative.
Example 1 (issues present): "This PR introduces several valuable improvements but requires immediate attention to {{totalCriticalIssues}} critical security vulnerabilities, notably in {{#if perFileSummaries.[0]}}{{perFileSummaries.[0].filename}}{{else}}key files{{/if}}. Overall quality is {{formattedOverallQualityScore}}/10. Prioritize addressing the identified security risks before merging."
Example 2 (good quality): "Excellent work on this PR! The changes are well-structured, leading to a high quality score of {{formattedOverallQualityScore}}/10 with no critical issues found across the {{fileCount}} analyzed files. This looks good to merge after reviewing the {{totalSuggestions}} minor suggestions."
Example 3 (mixed): "The PR achieves its main goals with an average quality score of {{formattedOverallQualityScore}}/10. While there are no critical security issues, address the {{totalHighIssues}} high-severity warnings and review the {{totalSuggestions}} suggestions for maintainability, particularly in files like {{#if perFileSummaries.[0]}}{{perFileSummaries.[0].filename}}{{/if}}."

Generate the prSummary. Ensure it is a narrative explanation suitable for display at the top of a detailed analysis view.
`;

const TLDR_SUMMARY_INSTRUCTIONS = `
Generate a "TL;DR" (Too Long; Didn't Read) summary.
Respond with ONLY up to 3 bullet points highlighting the most critical issues or key positive takeaways.
Each bullet point should be concise and impactful.
If critical/high security issues exist, prioritize those.
If no critical/high issues, mention overall quality and any significant suggestions.
If no major issues or outstanding points, state "No major critical issues or key takeaways identified."

Example TL;DR:
- Addresses 2 critical XSS vulnerabilities in payment.js.
- Introduces 1 high-severity SQL injection risk in user_model.py.
- Overall quality score is low (4.2/10), requires careful review.

Or for a good PR:
- High overall quality (9.1/10) with no critical security issues.
- Implemented requested performance optimizations effectively.
- Code is well-documented and maintainable.

Generate the prSummary in this bulleted TL;DR format.
`;


const prompt = ai.definePrompt({
  name: 'summarizePrAnalysisPrompt',
  input: {schema: SummarizePrAnalysisPromptContextSchema}, 
  output: {schema: SummarizePrAnalysisOutputSchema},
  prompt: `You are an expert Code Review AI Lead. You have received analysis results for: "{{prTitle}}".

Key aggregated metrics:
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

{{{effectivePromptInstructions}}}
`,
});

const summarizePrAnalysisFlow = ai.defineFlow(
  {
    name: 'summarizePrAnalysisFlow',
    inputSchema: SummarizePrAnalysisInputSchema, // Flow input remains the original schema
    outputSchema: SummarizePrAnalysisOutputSchema,
  },
  async (input) => {
    const promptContext = {
      ...input,
      formattedOverallQualityScore: input.overallQualityScore.toFixed(1),
      effectivePromptInstructions: input.tldrMode ? TLDR_SUMMARY_INSTRUCTIONS : DETAILED_SUMMARY_INSTRUCTIONS,
    };
    
    if (input.tldrMode) {
        console.log(`[summarizePrAnalysisFlow] Generating TL;DR summary for: ${input.prTitle}`);
    } else {
        console.log(`[summarizePrAnalysisFlow] Generating detailed summary for: ${input.prTitle}`);
    }
    
    const {output} = await prompt(promptContext);
    if (!output || !output.prSummary || output.prSummary.trim() === "") {
        console.warn(`[summarizePrAnalysisFlow] AI failed to generate a summary (tldrMode: ${input.tldrMode || false}). Falling back for "${input.prTitle}".`);
        return { prSummary: FALLBACK_SUMMARY_MESSAGE };
    }
    return output!;
  }
);

const FALLBACK_SUMMARY_MESSAGE = "Overall analysis summary could not be generated for this item.";

