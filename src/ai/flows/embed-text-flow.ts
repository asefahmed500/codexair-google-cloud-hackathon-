
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
    if (!input.text || input.text.trim() === "") {
      console.error('[embedTextFlow] Input text is empty or whitespace. Cannot generate embedding.');
      throw new Error('Input text for embedding cannot be empty.');
    }

    let embedResponse: any;
    try {
      embedResponse = await ai.embed({
          embedder: 'googleai/text-embedding-004',
          content: input.text, // Genkit handles tokenization internally
      });
    } catch (e: any) {
        console.error('[embedTextFlow] ai.embed() call threw an exception:', e);
        const errorMessage = e.details || e.message || 'Unknown error during embedding generation.';
        throw new Error(`Embedding generation failed: ${errorMessage}`);
    }
    
    const embedding = embedResponse?.embedding;

    // Check if embedding is a valid, non-empty array of numbers
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0 || !embedding.every(n => typeof n === 'number')) {
        console.error('[embedTextFlow] Failed to extract a valid, non-empty embedding array from ai.embed response.');
        console.error('[embedTextFlow] Input text was (first 100 chars):', input.text.substring(0, 100));
        console.error('[embedTextFlow] Full response from ai.embed was:', JSON.stringify(embedResponse, null, 2));
        throw new Error('Failed to generate a valid embedding for the provided text. The AI model did not return the expected data (e.g., empty or invalid array).');
    }
    
    // Check for correct dimensions, but treat as a warning for now, still return the embedding if it's otherwise valid.
    if (embedding.length !== 768) {
        console.warn(`[embedTextFlow] Generated embedding has ${embedding.length} dimensions, expected 768. This might cause issues with vector search but will be returned. Input text (first 100 chars): ${input.text.substring(0,100)}`);
        // Depending on strictness, you might throw an error here or allow it but log a warning.
    }

    return { embedding: embedding };
  }
);

