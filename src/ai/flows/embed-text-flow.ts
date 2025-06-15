
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

// This flow directly calls the embedding model.
const embedTextFlow = ai.defineFlow(
  {
    name: 'embedTextFlow',
    inputSchema: EmbedTextInputSchema,
    outputSchema: EmbedTextOutputSchema,
  },
  async (input) => {
    const { embedding } = await ai.embed({
        embedder: 'googleai/text-embedding-004',
        content: input.text,
    });
    
    if (!embedding || !Array.isArray(embedding) || !embedding.every(n => typeof n === 'number')) {
        console.error('[embedTextFlow] Failed to extract a valid embedding array. Embedding was:', embedding);
        throw new Error('Failed to generate a valid embedding for the provided text.');
    }
    
    if (embedding.length !== 768) {
        console.warn(`[embedTextFlow] Generated embedding has ${embedding.length} dimensions, expected 768. This might cause issues with vector search.`);
        // Depending on strictness, you might throw an error or allow it but log a warning.
        // For now, a warning is logged, and the embedding is returned.
    }

    return { embedding: embedding };
  }
);

