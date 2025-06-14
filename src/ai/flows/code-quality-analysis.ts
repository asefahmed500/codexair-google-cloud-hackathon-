
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
        title: z.string().describe('Concise title for the security issue (e.g., "Reflected XSS", "SQL Injection in userController.js", "Hardcoded Secret").'),
        description: z.string().describe('Detailed description of the security issue, explaining the vulnerability and potential impact.'),
        file: z.string().describe('File where the issue was found.'),
        line: z.number().optional().describe('Line number where the issue begins.'),
        suggestion: z.string().describe('Actionable suggestion, ideally with a corrected code example (the "fix") on how to resolve the issue. For example: "Use res.send(escape(req.query.name))" for an XSS. For hardcoded secrets, suggest environment variables or a secrets manager.'),
        cwe: z.string().optional().describe('Common Weakness Enumeration (CWE) identifier (e.g., "CWE-79", "CWE-89", "CWE-798" for Use of Hardcoded Credentials). If a CWE is identified, use the fetchCveDetails tool to get more information.'),
      })
    )
    .describe('List of security vulnerabilities or warnings found in the code.'),
  suggestions: z
    .array(
      z.object({
        type: z.enum(['performance', 'style', 'bug', 'feature', 'optimization', 'code_smell']).describe('Type of suggestion (e.g., performance improvement, style correction, potential bug, code smell, optimization).'),
        priority: z.enum(['high', 'medium', 'low']).describe('Priority of the suggestion.'),
        title: z.string().describe('Concise title for the suggestion.'),
        description: z.string().describe('Detailed description of the suggestion and its rationale. Address readability, duplication, maintainability aspects like magic numbers, poor naming, missing docs, deeply nested code, long methods here under appropriate types like "code_smell" or "style".'),
        file: z.string().describe('File the suggestion applies to.'),
        line: z.number().optional().describe('Line number the suggestion applies to.'),
        codeExample: z.string().optional().describe('Improved code example demonstrating the suggestion or fix.'),
      })
    )
    .describe('List of suggestions to improve the code quality, performance, or style. Cover aspects like readability, duplication, maintainability (magic numbers, poor naming, missing docs), complexity (deeply nested code, long methods).'),
  metrics: z
    .object({
      linesOfCode: z.number().describe('Number of lines of code.'),
      cyclomaticComplexity: z.number().describe('Calculated cyclomatic complexity.'),
      cognitiveComplexity: z.number().describe('Calculated cognitive complexity.'),
      duplicateBlocks: z.number().describe('Number of detected duplicate code blocks.'),
    })
    .describe('Key code metrics.'),
  aiInsights: z.string().describe('Overall insights and summarization of findings for this specific file. Format this like: "## AI Review Summary\n✅ [score]/10 quality score\n⚠️ [X] Critical Issues ([types])\n💡 [Y] Optimizations Available". Be concise and impactful.'),
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
  prompt: `You are an expert Code Review AI. Analyze the following code snippet from the file "{{filename}}" for overall quality, security, performance, complexity, maintainability, code smells, and style.

  Code to Analyze:
  \`\`\`
  {{{code}}}
  \`\`\`

  Analysis Instructions:
  1.  **Quality Score (1-10):** Provide an overall quality score. This numerical score will be part of the 'qualityScore' field. Consider readability, structure, and best practices.
  2.  **Complexity & Maintainability Scores:** Assess and provide numerical scores for these. 'complexity' should reflect cyclomatic or cognitive complexity. 'maintainability' should be an index (0-100 or similar).
  3.  **Security Scanning (Security Issues):**
      *   Identify security flaws (e.g., XSS, SQL Injection, Auth Bypass, Info Leaks, Hardcoded Secrets/Credentials - CWE-798).
      *   For each, specify: 'type', 'severity' (critical, high, medium, low), 'title', 'description', 'file', 'line'.
      *   **Crucially, for the 'suggestion' field, provide an actionable fix, ideally as a corrected code example. For example, if XSS is found from \`req.query.name\`, the suggestion might be \`Use res.send(escape(req.query.name))\`. For hardcoded secrets, suggest environment variables or a secrets manager.**
      *   If you identify a specific Common Weakness Enumeration (CWE) ID (e.g., CWE-79, CWE-89, CWE-798), you MUST include it in the 'cwe' field. If you provide a CWE, use the 'fetchCveDetails' tool to get more information to enrich your analysis if the model deems it necessary.
  4.  **Improvement Suggestions (Performance, Code Smells, Style, Readability, Duplication, Maintainability Aspects, etc.):**
      *   **Performance Suggestions:** Identify performance bottlenecks. Set 'type' to 'performance' or 'optimization'. Example: 'title': "Inefficient Loop Detected", 'description': "Replace O(n²) loop with hashmap (O(n)) for better performance." Include a 'codeExample' if applicable.
      *   **Code Smell Detection & Complexity Issues:** Identify issues like long methods, deeply nested code, duplicated code, or overly complex logic. Set 'type' to 'code_smell'. Example: 'title': "Long Method Detected", 'description': "Method 'processData' is 42 lines long. Consider breaking it into smaller, more manageable functions." Also, use this for issues like "Avoid Deep Nesting."
      *   **Style, Readability & Maintainability Aspects:** Address issues related to coding conventions, naming (poor naming), formatting, magic numbers, missing documentation. Set 'type' to 'style'. Example: 'title': "Inconsistent Naming Convention", 'description': "Variable 'user_data' uses snake_case while other variables use camelCase. Standardize to camelCase for consistency.", 'codeExample': "const userData = ...". For magic numbers: 'title': "Avoid Magic Numbers", 'description': "Replace '3.14' with a named constant like 'PI'." For missing docs: 'title': "Add Documentation", 'description': "Consider adding JSDoc comments to explain the function's purpose, parameters, and return value."
      *   **Potential Bugs:** Identify logic errors or potential runtime issues. Set 'type' to 'bug'. Example: 'title': "Potential Null Pointer Exception", 'description': "Object 'response.data' might be null here, leading to an error if 'response.data.items' is accessed without a check."
      *   Provide 'priority' (high, medium, low) for all suggestions.
      *   Include 'codeExample' where it significantly clarifies the suggestion.
  5.  **Code Metrics:** Calculate lines of code, cyclomatic complexity, cognitive complexity, and number of duplicate code blocks.
  6.  **AI Insights (File-Level Summary):** Provide an overall summary of your findings for this *specific file*. Format it exactly like this:
      \`\`\`markdown
      ## AI Review Summary
      ✅ [qualityScore]/10 quality score
      ⚠️ [Number] Critical/High Issues ([Comma-separated list of critical/high issue titles for this file, if any, e.g., "SQLi, Hardcoded Secret"])
      💡 [Number] Optimizations/Suggestions Available (for this file)
      \`\`\`
      Replace bracketed placeholders with actual values based *only on the current file's analysis*. If no critical/high issues for this file, state "0 Critical/High Issues". If no optimizations for this file, state "0 Optimizations/Suggestions Available".

  Filename context: {{{filename}}}
  Respond strictly in the JSON format defined by the output schema. Ensure all fields are populated accurately based on your analysis of the provided code.
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
    // Post-process aiInsights to ensure the quality score from the dedicated field is used for this file
    if (output && output.aiInsights && typeof output.qualityScore === 'number') {
        output.aiInsights = output.aiInsights.replace(/\[qualityScore\]\/10/g, `${output.qualityScore.toFixed(1)}/10`);

        const criticalHighIssues = (output.securityIssues || []).filter(
            (issue) => issue.severity === 'critical' || issue.severity === 'high'
        );
        output.aiInsights = output.aiInsights.replace(/\[Number\] Critical\/High Issues/g, `${criticalHighIssues.length} Critical/High Issues`);
        
        if (criticalHighIssues.length > 0) {
            const issueTitles = criticalHighIssues.map(issue => issue.title).join(', ');
            // Ensure the replacement target matches the placeholder, including potential parentheses
            output.aiInsights = output.aiInsights.replace(/\[Comma-separated list of critical\/high issue titles for this file, if any, e.g., "SQLi, Hardcoded Secret"\]/g, `(${issueTitles})`);
        } else {
            // If no critical/high issues, remove the placeholder including its surrounding parentheses
            output.aiInsights = output.aiInsights.replace(/\s*\(\[Comma-separated list of critical\/high issue titles for this file, if any, e.g., "SQLi, Hardcoded Secret"\]\)/g, '');
        }


        const totalSuggestions = (output.suggestions || []).length;
        output.aiInsights = output.aiInsights.replace(/\[Number\] Optimizations\/Suggestions Available \(for this file\)/g, `${totalSuggestions} Optimizations/Suggestions Available`);
    }
    return output!;
  }
);

