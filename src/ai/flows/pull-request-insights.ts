'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating AI-powered insights on pull requests.
 *
 * The flow analyzes the changes in a pull request, identifies potential risks,
 * and provides suggestions for improvement. It exports:
 * - `getPullRequestInsights`: A function that takes pull request details as input and returns insights.
 * - `PullRequestInsightsInput`: The input type for the `getPullRequestInsights` function.
 * - `PullRequestInsightsOutput`: The output type for the `getPullRequestInsights` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PullRequestInsightsInputSchema = z.object({
  title: z.string().describe('The title of the pull request.'),
  description: z.string().describe('The description of the pull request.'),
  changes: z.string().describe('A summary of the changes included in the pull request.'),
});
export type PullRequestInsightsInput = z.infer<typeof PullRequestInsightsInputSchema>;

const PullRequestInsightsOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the changes in the pull request.'),
  risks: z.string().describe('Potential risks associated with the changes.'),
  suggestions: z.string().describe('Suggestions for improving the code in the pull request.'),
});
export type PullRequestInsightsOutput = z.infer<typeof PullRequestInsightsOutputSchema>;

export async function getPullRequestInsights(input: PullRequestInsightsInput): Promise<PullRequestInsightsOutput> {
  return pullRequestInsightsFlow(input);
}

const pullRequestInsightsPrompt = ai.definePrompt({
  name: 'pullRequestInsightsPrompt',
  input: {schema: PullRequestInsightsInputSchema},
  output: {schema: PullRequestInsightsOutputSchema},
  prompt: `You are an AI assistant specializing in code review. Analyze the following pull request and provide a summary of the changes, potential risks, and suggestions for improvement.

Pull Request Title: {{{title}}}
Pull Request Description: {{{description}}}
Changes: {{{changes}}}

Summary:
Risks:
Suggestions:`,
});

const pullRequestInsightsFlow = ai.defineFlow(
  {
    name: 'pullRequestInsightsFlow',
    inputSchema: PullRequestInsightsInputSchema,
    outputSchema: PullRequestInsightsOutputSchema,
  },
  async input => {
    const {output} = await pullRequestInsightsPrompt(input);
    return output!;
  }
);
