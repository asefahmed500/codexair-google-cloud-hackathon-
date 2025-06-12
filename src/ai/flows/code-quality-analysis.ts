
'use server';

/**
 * @fileOverview This file defines a Genkit flow for analyzing code quality, security vulnerabilities, and style issues.
 *
 * It exports:
 * - `analyzeCode` - An asynchronous function that takes code as input and returns an analysis of its quality, security, and style, including a vector embedding.
 * - `CodeAnalysisInput` - The TypeScript type definition for the input to the `analyzeCode` function.
 * - `CodeAnalysisOutput` - The TypeScript type definition for the output of the `analyzeCode` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CodeAnalysisInputSchema = z.object({
  code: z.string().describe('The code to be analyzed.'),
  filename: z.string().describe('The filename of the code being analyzed, including the file extension.'),
});
export type CodeAnalysisInput = z.infer<typeof CodeAnalysisInputSchema>;

const CodeAnalysisOutputSchema = z.object({
  qualityScore: z.number().describe('Overall quality score (1-10).'),
  complexity: z.number().describe('Cyclomatic complexity of the code.'),
  maintainability: z.number().describe('Maintainability index of the code.'),
  securityIssues: z
    .array(
      z.object({
        type: z.enum(['vulnerability', 'warning', 'info']).describe('Type of security issue.'),
        severity: z.enum(['critical', 'high', 'medium', 'low']).describe('Severity of the security issue.'),
        title: z.string().describe('Title of the security issue.'),
        description: z.string().describe('Detailed description of the security issue.'),
        file: z.string().describe('File where the issue was found.'),
        line: z.number().optional().describe('Line number where the issue was found.'),
        suggestion: z.string().describe('Suggestion on how to fix the issue.'),
        cwe: z.string().optional().describe('Common Weakness Enumeration (CWE) identifier.'),
      })
    )
    .describe('List of security vulnerabilities found in the code.'),
  suggestions: z
    .array(
      z.object({
        type: z.enum(['performance', 'style', 'bug', 'feature']).describe('Type of suggestion.'),
        priority: z.enum(['high', 'medium', 'low']).describe('Priority of the suggestion.'),
        title: z.string().describe('Title of the suggestion.'),
        description: z.string().describe('Detailed description of the suggestion.'),
        file: z.string().describe('File the suggestion applies to.'),
        line: z.number().optional().describe('Line number the suggestion applies to.'),
        codeExample: z.string().optional().describe('Improved code example demonstrating the suggestion.'),
      })
    )
    .describe('List of suggestions to improve the code.'),
  metrics: z
    .object({
      linesOfCode: z.number().describe('Number of lines of code.'),
      cyclomaticComplexity: z.number().describe('Cyclomatic complexity.'),
      cognitiveComplexity: z.number().describe('Cognitive complexity.'),
      duplicateBlocks: z.number().describe('Number of duplicate code blocks.'),
    })
    .describe('Code metrics.'),
  aiInsights: z.string().describe('Overall insights and recommendations from the AI.'),
  vectorEmbedding: z.array(z.number()).optional().describe('A 768-dimension vector embedding of the code, if generated.'),
});
export type CodeAnalysisOutput = z.infer<typeof CodeAnalysisOutputSchema>;

export async function analyzeCode(input: CodeAnalysisInput): Promise<CodeAnalysisOutput> {
  return analyzeCodeFlow(input);
}

const analyzeCodePrompt = ai.definePrompt({
  name: 'analyzeCodePrompt',
  input: {schema: CodeAnalysisInputSchema},
  output: {schema: CodeAnalysisOutputSchema},
  prompt: `You are a code quality analysis tool. Analyze the following code for potential bugs, security vulnerabilities, style issues, and maintainability.

  Provide an overall quality score from 1-10.
  Identify specific security vulnerabilities, performance issues, code style problems, and maintainability concerns.
  Provide actionable suggestions for improvement with code examples where applicable.
  Also, generate a 768-dimension vector embedding for the provided code snippet. If you cannot generate a meaningful embedding, omit the 'vectorEmbedding' field or set it to null.

  File: {{{filename}}}
  Code:
  \`\`\`
  {{{code}}}
  \`\`\`
  
  Response should be in JSON format as specified by the output schema. Key fields include:
  qualityScore (number), complexity (number), maintainability (number), 
  securityIssues (array of objects with type, severity, title, description, file, line, suggestion, cwe),
  suggestions (array of objects with type, priority, title, description, file, line, codeExample),
  metrics (object with linesOfCode, cyclomaticComplexity, cognitiveComplexity, duplicateBlocks),
  aiInsights (string),
  vectorEmbedding (array of 768 numbers, optional).
  `,
});

const analyzeCodeFlow = ai.defineFlow(
  {
    name: 'analyzeCodeFlow',
    inputSchema: CodeAnalysisInputSchema,
    outputSchema: CodeAnalysisOutputSchema,
  },
  async input => {
    const {output} = await analyzeCodePrompt(input);
    return output!;
  }
);
