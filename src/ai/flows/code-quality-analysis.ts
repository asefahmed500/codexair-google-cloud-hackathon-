
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
import { fetchCveDetailsTool } from '@/ai/tools/fetch-cve-details'; // Import the new tool

const CodeAnalysisInputSchema = z.object({
  code: z.string().describe('The code to be analyzed.'),
  filename: z.string().describe('The filename of the code being analyzed, including the file extension, to provide context (e.g., "userController.js", "auth.py").'),
});
export type CodeAnalysisInput = z.infer<typeof CodeAnalysisInputSchema>;

const CodeAnalysisOutputSchema = z.object({
  qualityScore: z.number().min(1).max(10).describe('Overall code quality score (1-10), considering readability, structure, and best practices.'),
  complexity: z.number().describe('Cyclomatic complexity or a similar cognitive complexity score for the code.'),
  maintainability: z.number().describe('Maintainability index (0-100 or similar scale) based on factors like code length, complexity, and comments.'),
  securityIssues: z
    .array(
      z.object({
        type: z.enum(['vulnerability', 'warning', 'info']).describe('Type of security issue.'),
        severity: z.enum(['critical', 'high', 'medium', 'low']).describe('Severity of the security issue.'),
        title: z.string().describe('Concise title for the security issue (e.g., "Reflected XSS", "SQL Injection").'),
        description: z.string().describe('Detailed description of the security issue, explaining the vulnerability and potential impact.'),
        file: z.string().describe('File where the issue was found.'),
        line: z.number().optional().describe('Line number where the issue begins.'),
        suggestion: z.string().describe('Actionable suggestion or code example on how to fix the issue.'),
        cwe: z.string().optional().describe('Common Weakness Enumeration (CWE) identifier (e.g., "CWE-79", "CWE-89"). If a CWE is identified, use the fetchCveDetails tool to get more information.'),
      })
    )
    .describe('List of security vulnerabilities or warnings found in the code.'),
  suggestions: z
    .array(
      z.object({
        type: z.enum(['performance', 'style', 'bug', 'feature', 'optimization', 'code_smell']).describe('Type of suggestion (e.g., performance improvement, style correction, potential bug, code smell).'),
        priority: z.enum(['high', 'medium', 'low']).describe('Priority of the suggestion.'),
        title: z.string().describe('Concise title for the suggestion.'),
        description: z.string().describe('Detailed description of the suggestion and its rationale.'),
        file: z.string().describe('File the suggestion applies to.'),
        line: z.number().optional().describe('Line number the suggestion applies to.'),
        codeExample: z.string().optional().describe('Improved code example demonstrating the suggestion or fix.'),
      })
    )
    .describe('List of suggestions to improve the code quality, performance, or style.'),
  metrics: z
    .object({
      linesOfCode: z.number().describe('Number of lines of code.'),
      cyclomaticComplexity: z.number().describe('Calculated cyclomatic complexity.'),
      cognitiveComplexity: z.number().describe('Calculated cognitive complexity.'),
      duplicateBlocks: z.number().describe('Number of detected duplicate code blocks.'),
    })
    .describe('Key code metrics.'),
  aiInsights: z.string().describe('Overall insights, summarization of findings, and high-level recommendations from the AI.'),
  vectorEmbedding: z.array(z.number()).optional().describe('A 768-dimension vector embedding of the code snippet, if successfully generated.'),
});
export type CodeAnalysisOutput = z.infer<typeof CodeAnalysisOutputSchema>;

export async function analyzeCode(input: CodeAnalysisInput): Promise<CodeAnalysisOutput> {
  return analyzeCodeFlow(input);
}

const analyzeCodePrompt = ai.definePrompt({
  name: 'analyzeCodePrompt',
  input: {schema: CodeAnalysisInputSchema},
  output: {schema: CodeAnalysisOutputSchema},
  tools: [fetchCveDetailsTool], // Make the tool available to the LLM
  prompt: `You are an expert Code Review AI. Analyze the following code snippet from the file "{{filename}}" for quality, security, performance, and maintainability.

  Code to Analyze:
  \`\`\`
  {{{code}}}
  \`\`\`

  Analysis Instructions:
  1.  **Quality Score (1-10):** Provide an overall quality score.
  2.  **Complexity & Maintainability:** Assess and provide scores.
  3.  **Security Vulnerabilities:**
      *   Identify security flaws (e.g., XSS, SQL Injection, Auth Bypass, Info Leaks).
      *   For each, specify: type, severity, title, description, file, line number.
      *   Provide a suggestion/fix, ideally with a corrected code example.
      *   Crucially, if you identify a specific Common Weakness Enumeration (CWE) ID (e.g., CWE-79, CWE-89), you MUST include it in the 'cwe' field. If you provide a CWE, consider using the 'fetchCveDetails' tool to get more information about it to enrich your analysis.
  4.  **Improvement Suggestions:**
      *   Identify code smells, potential bugs, performance bottlenecks, or style issues.
      *   For each, specify: type, priority, title, description, file, line number, and a code example for the fix if applicable.
  5.  **Code Metrics:** Calculate lines of code, cyclomatic complexity, cognitive complexity, and duplicate blocks.
  6.  **AI Insights:** Provide a brief overall summary of your findings.
  7.  **Vector Embedding:** Generate a 768-dimension vector embedding for the provided code snippet. If you cannot generate a meaningful embedding, omit the 'vectorEmbedding' field or set it to null.

  Respond strictly in the JSON format defined by the output schema. Ensure all fields are populated accurately based on your analysis.
  Filename context: {{{filename}}}
  `,
});

const analyzeCodeFlow = ai.defineFlow(
  {
    name: 'analyzeCodeFlow',
    inputSchema: CodeAnalysisInputSchema,
    outputSchema: CodeAnalysisOutputSchema,
    tools: [fetchCveDetailsTool], // Also declare tool for the flow if it's to be managed by flow state (optional here as prompt handles it)
  },
  async input => {
    const {output} = await analyzeCodePrompt(input);
    return output!;
  }
);
