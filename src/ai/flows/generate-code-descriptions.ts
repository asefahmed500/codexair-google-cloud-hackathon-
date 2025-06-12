'use server';

/**
 * @fileOverview AI agent that generates descriptions for code snippets.
 *
 * - generateCodeDescription - A function that generates descriptions for code snippets.
 * - GenerateCodeDescriptionInput - The input type for the generateCodeDescription function.
 * - GenerateCodeDescriptionOutput - The return type for the generateCodeDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateCodeDescriptionInputSchema = z.object({
  code: z.string().describe('The code snippet to generate a description for.'),
  language: z.string().describe('The programming language of the code snippet.'),
});
export type GenerateCodeDescriptionInput = z.infer<typeof GenerateCodeDescriptionInputSchema>;

const GenerateCodeDescriptionOutputSchema = z.object({
  description: z.string().describe('The generated description for the code snippet.'),
});
export type GenerateCodeDescriptionOutput = z.infer<typeof GenerateCodeDescriptionOutputSchema>;

export async function generateCodeDescription(input: GenerateCodeDescriptionInput): Promise<GenerateCodeDescriptionOutput> {
  return generateCodeDescriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCodeDescriptionPrompt',
  input: {schema: GenerateCodeDescriptionInputSchema},
  output: {schema: GenerateCodeDescriptionOutputSchema},
  prompt: `You are an AI assistant that generates concise and informative descriptions for code snippets.

  Given the following code snippet and its programming language, generate a description that explains what the code does.

  Language: {{{language}}}
  Code:
  \`\`\`{{{language}}}
  {{{code}}}
  \`\`\`
  `,
});

const generateCodeDescriptionFlow = ai.defineFlow(
  {
    name: 'generateCodeDescriptionFlow',
    inputSchema: GenerateCodeDescriptionInputSchema,
    outputSchema: GenerateCodeDescriptionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
