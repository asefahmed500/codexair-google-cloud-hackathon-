
'use server';
/**
 * @fileOverview AI agent that generates vector embeddings for arbitrary text.
 *
 * - embedText - A function that takes text and returns its embedding.
 * - EmbedTextInput - The input type for the embedText function.
 * - EmbedTextOutput - The return type for the embedText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EmbedTextInputSchema = z.object({
  text: z.string().describe('The text to generate an embedding for. This can be a code snippet or a natural language query.'),
});
export type EmbedTextInput = z.infer<typeof EmbedTextInputSchema>;

const EmbedTextOutputSchema = z.object({
  embedding: z.array(z.number()).describe('The generated vector embedding for the input text. Expected to be 768 dimensions for text-embedding-004.'),
});
export type EmbedTextOutput = z.infer<typeof EmbedTextOutputSchema>;

export async function embedText(input: EmbedTextInput): Promise<EmbedTextOutput> {
  return embedTextFlow(input);
}

// This flow directly calls the embedding model. No complex prompt needed.
const embedTextFlow = ai.defineFlow(
  {
    name: 'embedTextFlow',
    inputSchema: EmbedTextInputSchema,
    outputSchema: EmbedTextOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
        model: 'googleai/text-embedding-004',
        prompt: input.text,
        // No explicit output schema needed here as we expect raw embedding array
    });
    
    let embeddingResult: number[] | undefined;

    if (Array.isArray(output) && output.every(n => typeof n === 'number')) {
        embeddingResult = output;
    } else if (output && typeof output === 'object') {
        // Handle potential nested structures some models might return
        if ('embedding' in output && Array.isArray(output.embedding)) embeddingResult = output.embedding;
        else if ('vector' in output && Array.isArray(output.vector)) embeddingResult = output.vector;
    }

    if (!embeddingResult || !embeddingResult.every(n => typeof n === 'number')) {
        console.error('[embedTextFlow] Failed to extract a valid embedding array. Output was:', output);
        throw new Error('Failed to generate a valid embedding for the provided text.');
    }
    
    if (embeddingResult.length !== 768) {
        console.warn(`[embedTextFlow] Generated embedding has ${embeddingResult.length} dimensions, expected 768. This might cause issues with vector search.`);
    }

    return { embedding: embeddingResult };
  }
);
