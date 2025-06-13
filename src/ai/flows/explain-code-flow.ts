
'use server';
/**
 * @fileOverview AI agent that explains code snippets.
 *
 * - explainCode - A function that takes a code snippet and a question, and returns an explanation.
 * - ExplainCodeInput - The input type for the explainCode function.
 * - ExplainCodeOutput - The return type for the explainCode function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExplainCodeInputSchema = z.object({
  code: z.string().describe('The code snippet to explain.'),
  language: z.string().optional().describe('The programming language of the code snippet. If not provided, the AI will attempt to infer it.'),
  question: z.string().describe('The specific question about the code (e.g., "What does this do?", "Why is this a bad practice?", "How can this be improved?").'),
});
export type ExplainCodeInput = z.infer<typeof ExplainCodeInputSchema>;

const ExplainCodeOutputSchema = z.object({
  explanation: z.string().describe('The AI-generated explanation for the code snippet in response to the question.'),
});
export type ExplainCodeOutput = z.infer<typeof ExplainCodeOutputSchema>;

export async function explainCode(input: ExplainCodeInput): Promise<ExplainCodeOutput> {
  return explainCodeFlow(input);
}

const explainCodePrompt = ai.definePrompt({
  name: 'explainCodePrompt',
  model: 'googleai/gemini-1.5-flash-latest', // Explicitly set the model here
  input: {schema: ExplainCodeInputSchema},
  output: {schema: ExplainCodeOutputSchema},
  prompt: `You are an expert AI programming assistant. A user has provided a code snippet{{#if language}} written in {{language}}{{/if}} and a question about it.
Analyze the code carefully and provide a clear, concise, and helpful explanation in response to the user's question.

User's Question: "{{{question}}}"

Code Snippet:
\`\`\`{{#if language}}{{language}}{{else}}auto{{/if}}
{{{code}}}
\`\`\`

Your Explanation:
`,
});

const explainCodeFlow = ai.defineFlow(
  {
    name: 'explainCodeFlow',
    inputSchema: ExplainCodeInputSchema,
    outputSchema: ExplainCodeOutputSchema,
  },
  async (input) => {
    const {output} = await explainCodePrompt(input);
    return output!;
  }
);


