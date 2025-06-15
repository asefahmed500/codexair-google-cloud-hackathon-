
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

    let embedApiResponse: any;
    try {
      embedApiResponse = await ai.embed({
          embedder: 'googleai/text-embedding-004',
          content: input.text,
      });
    } catch (e: any) {
        console.error('[embedTextFlow] ai.embed() call threw an exception:', e);
        const errorMessage = (e as any).details || (e as any).message || 'Unknown error during embedding generation.';
        throw new Error(`Embedding generation failed: ${errorMessage}`);
    }

    let extractedEmbedding: number[] | undefined = undefined;

    if (Array.isArray(embedApiResponse) &&
        embedApiResponse.length > 0 &&
        embedApiResponse[0] &&
        typeof embedApiResponse[0] === 'object' &&
        embedApiResponse[0] !== null &&
        Object.prototype.hasOwnProperty.call(embedApiResponse[0], 'embedding')) {
        
        const potentialEmbedding = (embedApiResponse[0] as any).embedding;

        if (Array.isArray(potentialEmbedding) &&
            potentialEmbedding.length > 0 &&
            potentialEmbedding.every(n => typeof n === 'number' && isFinite(n))) {
            extractedEmbedding = potentialEmbedding;
            console.log('[embedTextFlow] Successfully extracted embedding from ai.embed() response structure: [ { embedding: [...] } ]');
        } else {
            console.error('[embedTextFlow] ai.embed() response [0].embedding was not a valid non-empty array of finite numbers.');
            console.error('[embedTextFlow] Value of (embedApiResponse[0] as any).embedding:', JSON.stringify(potentialEmbedding));
        }
    } else if (embedApiResponse && typeof embedApiResponse === 'object' && Object.prototype.hasOwnProperty.call(embedApiResponse, 'embedding')) {
        // Fallback for standard { embedding: [...] } structure, though logs indicate array structure for text-embedding-004
        const potentialEmbedding = (embedApiResponse as any).embedding;
        if (Array.isArray(potentialEmbedding) &&
            potentialEmbedding.length > 0 &&
            potentialEmbedding.every(n => typeof n === 'number' && isFinite(n))) {
            extractedEmbedding = potentialEmbedding;
            console.log('[embedTextFlow] Successfully extracted embedding from ai.embed() response structure: { embedding: [...] }');
        } else {
            console.error('[embedTextFlow] ai.embed() response .embedding was not a valid non-empty array of finite numbers.');
            console.error('[embedTextFlow] Value of (embedApiResponse as any).embedding:', JSON.stringify(potentialEmbedding));
        }
    } else {
        console.error('[embedTextFlow] ai.embed() response did not match expected structures.');
    }
    
    if (!extractedEmbedding) {
        console.error('[embedTextFlow] Final check: extractedEmbedding is undefined or invalid.');
        console.error('[embedTextFlow] Input text was (first 100 chars):', input.text.substring(0, 100));
        console.error('[embedTextFlow] Original response from ai.embed was:', JSON.stringify(embedApiResponse, null, 2));
        throw new Error('Failed to generate a valid embedding for the provided text. The AI model did not return the expected data (e.g., empty or invalid array).');
    }
    
    if (extractedEmbedding.length !== 768) {
        // This is now a warning, as the primary check is for a valid, non-empty array of numbers.
        // The vector search component will ultimately fail if dimensions don't match its index.
        console.warn(`[embedTextFlow] Generated embedding has ${extractedEmbedding.length} dimensions, expected 768. This might cause issues with vector search. Input text (first 100 chars): ${input.text.substring(0,100)}`);
    }

    return { embedding: extractedEmbedding };
  }
);
