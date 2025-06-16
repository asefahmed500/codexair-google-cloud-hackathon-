
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { connectMongoose } from '@/lib/mongodb';
import { findSimilarCode } from '@/lib/vector-search';
import type { SimilarCodeResult } from '@/types';
import { embedText, type EmbedTextInput } from '@/ai/flows/embed-text-flow';
import { z } from 'zod'; // Using zod for input validation

const SemanticSearchInputSchema = z.object({
  queryText: z.string().min(1, "Query text cannot be empty.").max(5000, "Query text is too long (max 5000 chars)."),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const reqBody = await request.json();
    let validatedInput: { queryText: string };
    try {
      validatedInput = SemanticSearchInputSchema.parse(reqBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid input', details: err.errors.map(e => e.message).join(', ') }, { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid input processing error' }, { status: 400 });
    }

    const { queryText } = validatedInput;

    // 1. Get embedding for the query text
    const embeddingOutput = await embedText({ text: queryText });
    const queryVector = embeddingOutput.embedding;

    if (!queryVector || queryVector.length === 0) {
      return NextResponse.json({ error: 'Could not generate embedding for the query text.' }, { status: 500 });
    }
     if (queryVector.length !== 768) {
      console.warn(`[API/semantic-text-search] Query vector dimension mismatch. Expected 768, got ${queryVector.length}. Search might be ineffective.`);
    }


    // 2. Use this embedding to find similar code
    // For arbitrary search, excludeAnalysisId and excludeFilename are not typically used
    // Not passing a similarityThresholdParam will allow findSimilarCode to use its dynamic default (0.40 for general)
    const similarCodeResults: SimilarCodeResult[] = await findSimilarCode(
      queryVector,
      10 // limit results
      // similarityThresholdParam is intentionally omitted here, findSimilarCode will use its default
    );

    return NextResponse.json({ results: similarCodeResults });

  } catch (error: any) {
    console.error('Error in /api/search/semantic-text-search:', error);
    let errorMessage = 'Internal server error during semantic search';
     if (error.message.toLowerCase().includes('embedding') || error.message.toLowerCase().includes('genkit')) {
        errorMessage = `AI processing error: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
