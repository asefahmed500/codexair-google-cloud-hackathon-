
'use server';

/**
 * @fileOverview This file defines a Genkit flow for analyzing code quality, security vulnerabilities, and style issues.
 *
 * It exports:
 * - `analyzeCode` - An asynchronous function that takes code as input and returns an analysis of its quality, security, and style.
 * - `CodeAnalysisInput` - The TypeScript type definition for the input to the `analyzeCode` function.
 * - `CodeAnalysisOutput` - The TypeScript type definition for the output of the `analyzeCode` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { fetchCveDetailsTool } from '@/ai/tools/fetch-cve-details'; 

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
        title: z.string().describe('Concise title for the security issue (e.g., "Reflected XSS", "SQL Injection in userController.js").'),
        description: z.string().describe('Detailed description of the security issue, explaining the vulnerability and potential impact.'),
        file: z.string().describe('File where the issue was found.'),
        line: z.number().optional().describe('Line number where the issue begins.'),
        suggestion: z.string().describe('Actionable suggestion, ideally with a corrected code example (the "fix") on how to resolve the issue. For example: "Use res.send(escape(req.query.name))" for an XSS.'),
        cwe: z.string().optional().describe('Common Weakness Enumeration (CWE) identifier (e.g., "CWE-79", "CWE-89"). If a CWE is identified, use the fetchCveDetails tool to get more information.'),
      })
    )
    .describe('List of security vulnerabilities or warnings found in the code.'),
  suggestions: z
    .array(
      z.object({
        type: z.enum(['performance', 'style', 'bug', 'feature', 'optimization', 'code_smell']).describe('Type of suggestion (e.g., performance improvement, style correction, potential bug, code smell, optimization).'),
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
  aiInsights: z.string().describe('Overall insights and summarization of findings. Format this like: "## AI Review Summary\n✅ [score]/10 quality score\n⚠️ [X] Critical Issues ([types])\n💡 [Y] Optimizations Available". Be concise and impactful.'),
});
export type CodeAnalysisOutput = z.infer<typeof CodeAnalysisOutputSchema>;

export async function analyzeCode(input: CodeAnalysisInput): Promise<CodeAnalysisOutput> {
  return analyzeCodeFlow(input);
}

const analyzeCodePrompt = ai.definePrompt({
  name: 'analyzeCodePrompt',
  input: {schema: CodeAnalysisInputSchema},
  output: {schema: CodeAnalysisOutputSchema},
  tools: [fetchCveDetailsTool], 
  prompt: `You are an expert Code Review AI. Analyze the following code snippet from the file "{{filename}}" for quality, security, performance, code smells, and maintainability.

  Code to Analyze:
  \`\`\`
  {{{code}}}
  \`\`\`

  Analysis Instructions:
  1.  **Quality Score (1-10):** Provide an overall quality score. This numerical score will be part of the 'qualityScore' field.
  2.  **Complexity & Maintainability:** Assess and provide numerical scores for these.
  3.  **Security Scanning (Security Issues):**
      *   Identify security flaws (e.g., XSS, SQL Injection, Auth Bypass, Info Leaks).
      *   For each, specify: 'type', 'severity', 'title', 'description', 'file', 'line'.
      *   **Crucially, for the 'suggestion' field, provide an actionable fix, ideally as a corrected code example. For example, if XSS is found from \`req.query.name\`, the suggestion might be \`Use res.send(escape(req.query.name))\`.**
      *   If you identify a specific Common Weakness Enumeration (CWE) ID (e.g., CWE-79, CWE-89), you MUST include it in the 'cwe' field. If you provide a CWE, consider using the 'fetchCveDetails' tool to get more information to enrich your analysis.
  4.  **Improvement Suggestions (Performance, Code Smells, Style, etc.):**
      *   **Performance Suggestions:** Identify performance bottlenecks. Set 'type' to 'performance' or 'optimization'. Example: 'title': "Inefficient Loop Detected", 'description': "Replace O(n²) loop with hashmap (O(n)) for better performance." Include a 'codeExample' if applicable. Common titles could be "Optimize Loop for Performance", "Consider Batch Operations", "Reduce Redundant API Calls".
      *   **Code Smell Detection:** Identify issues like long methods, duplicated code, or overly complex logic. Set 'type' to 'code_smell'. Example: 'title': "Long Method Detected", 'description': "Method 'processData' is 42 lines long. Consider breaking it into smaller, more manageable functions." Common titles: "Refactor Long Method", "Extract Reusable Component", "Reduce Code Duplication".
      *   **Style Suggestions:** Issues related to coding conventions, naming, formatting. Set 'type' to 'style'. Example: 'title': "Inconsistent Naming Convention", 'description': "Variable 'user_data' uses snake_case while other variables use camelCase. Standardize to camelCase for consistency.", 'codeExample': "const userData = ..." Common titles: "Use Consistent Formatting", "Improve Variable Naming", "Add Missing Docstrings".
      *   **Potential Bugs:** Identify logic errors or potential runtime issues. Set 'type' to 'bug'. Example: 'title': "Potential Null Pointer Exception", 'description': "Object 'response.data' might be null here, leading to an error if 'response.data.items' is accessed without a check." Common titles: "Handle Potential Null Values", "Check Array Bounds".
      *   **Other Suggestions:** For general best practices, feature ideas, or further optimizations not covered above. Set 'type' accordingly (e.g., 'bug', 'style', 'feature', 'optimization'). Include 'codeExample' if applicable. Common titles: "Avoid Deep Nesting", "Simplify Conditional Logic".
  5.  **Code Metrics:** Calculate lines of code, cyclomatic complexity, cognitive complexity, and number of duplicate code blocks.
  6.  **AI Insights (Auto-Generated Summary):** Provide an overall summary of your findings. Format it exactly like this:
      \`\`\`markdown
      ## AI Review Summary
      ✅ [qualityScore]/10 quality score
      ⚠️ [Number] Critical/High Issues ([Comma-separated list of critical/high issue titles, if any, e.g., "SQLi, XSS"])
      💡 [Number] Optimizations/Suggestions Available
      \`\`\`
      Replace bracketed placeholders with actual values. If no critical/high issues, state "0 Critical/High Issues". If no optimizations, state "0 Optimizations/Suggestions Available".

  Filename context: {{{filename}}}
  Respond strictly in the JSON format defined by the output schema. Ensure all fields are populated accurately based on your analysis.
  `,
});

const analyzeCodeFlow = ai.defineFlow(
  {
    name: 'analyzeCodeFlow',
    inputSchema: CodeAnalysisInputSchema,
    outputSchema: CodeAnalysisOutputSchema,
    tools: [fetchCveDetailsTool], 
  },
  async input => {
    const {output} = await analyzeCodePrompt(input);
    // Post-process aiInsights to ensure the quality score from the dedicated field is used
    if (output && output.aiInsights && typeof output.qualityScore === 'number') {
        output.aiInsights = output.aiInsights.replace(/\[qualityScore\]\/10/g, `${output.qualityScore.toFixed(1)}/10`);

        const criticalHighIssues = (output.securityIssues || []).filter(
            (issue) => issue.severity === 'critical' || issue.severity === 'high'
        );
        output.aiInsights = output.aiInsights.replace(/\[Number\] Critical\/High Issues/g, `${criticalHighIssues.length} Critical/High Issues`);
        if (criticalHighIssues.length > 0) {
            const issueTitles = criticalHighIssues.map(issue => issue.title).join(', ');
            output.aiInsights = output.aiInsights.replace(/\[Comma-separated list of critical\/high issue titles, if any, e.g., "SQLi, XSS"\]/g, `(${issueTitles})`);
        } else {
            output.aiInsights = output.aiInsights.replace(/\(\[Comma-separated list of critical\/high issue titles, if any, e.g., "SQLi, XSS"\]\)/g, '');
        }

        const totalSuggestions = (output.suggestions || []).length;
        output.aiInsights = output.aiInsights.replace(/\[Number\] Optimizations\/Suggestions Available/g, `${totalSuggestions} Optimizations/Suggestions Available`);

    }
    return output!;
  }
);

