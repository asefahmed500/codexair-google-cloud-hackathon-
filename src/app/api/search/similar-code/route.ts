
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, RepositoryScan, connectMongoose } from '@/lib/mongodb'; // Added RepositoryScan
import { findSimilarCode } from '@/lib/vector-search';
import mongoose from 'mongoose';
import type { SimilarCodeResult, FileAnalysisItem, CodeAnalysis, RepositoryScanResult } from '@/types'; // Added more types
import { z } from 'zod';

const similarCodeRequestSchema = z.object({
  queryAnalysisId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), { message: "Invalid queryAnalysisId" }),
  queryFilename: z.string().min(1, "queryFilename cannot be empty"),
  sourceType: z.enum(['pr_analysis', 'repo_scan']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const reqBody = await request.json();
    const validationResult = similarCodeRequestSchema.safeParse(reqBody);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { queryAnalysisId, queryFilename, sourceType = 'pr_analysis' } = validationResult.data; // Default to pr_analysis if not provided

    let sourceDocument: (CodeAnalysis | RepositoryScanResult) | null = null;

    if (sourceType === 'repo_scan') {
      console.log(`[API/similar-code] Fetching source RepositoryScan document with ID: ${queryAnalysisId}`);
      sourceDocument = await RepositoryScan.findById(queryAnalysisId).lean();
    } else { // 'pr_analysis' or default
      console.log(`[API/similar-code] Fetching source Analysis (PR) document with ID: ${queryAnalysisId}`);
      sourceDocument = await Analysis.findById(queryAnalysisId).lean();
    }

    if (!sourceDocument) {
      return NextResponse.json({ error: `Source ${sourceType} document not found with ID ${queryAnalysisId}` }, { status: 404 });
    }

    const sourceFileAnalysis = sourceDocument.fileAnalyses?.find(
      (fa: FileAnalysisItem) => fa.filename === queryFilename
    );

    if (!sourceFileAnalysis) {
      return NextResponse.json({ error: `File ${queryFilename} not found in source ${sourceType} document` }, { status: 404 });
    }

    if (!sourceFileAnalysis.vectorEmbedding || sourceFileAnalysis.vectorEmbedding.length === 0) {
      return NextResponse.json({ error: `No vector embedding found for ${queryFilename} in source ${sourceType} document. Cannot perform similarity search.` }, { status: 400 });
    }

    if (sourceFileAnalysis.vectorEmbedding.length !== 768) {
      return NextResponse.json({ error: `Vector embedding for ${queryFilename} has incorrect dimensions (${sourceFileAnalysis.vectorEmbedding.length} instead of 768).` }, { status: 400 });
    }

    // Default similarity threshold for contextual searches is higher
    const SIMILARITY_THRESHOLD_CONTEXTUAL = 0.75;
    
    console.log(`[API/similar-code] Performing findSimilarCode. queryAnalysisId (for exclusion): ${queryAnalysisId}, queryFilename: ${queryFilename}, threshold: ${SIMILARITY_THRESHOLD_CONTEXTUAL}`);

    const similarCodeResults: SimilarCodeResult[] = await findSimilarCode(
      sourceFileAnalysis.vectorEmbedding,
      5, // limit
      SIMILARITY_THRESHOLD_CONTEXTUAL, // similarityThreshold
      queryAnalysisId, // excludeAnalysisOrScanId (the ID of the document itself)
      queryFilename    // excludeFilename
    );
    
    console.log(`[API/similar-code] Found ${similarCodeResults.length} similar code results.`);

    return NextResponse.json({ results: similarCodeResults });

  } catch (error: any) {
    console.error('[API/similar-code] Error:', error);
    let errorMessage = 'Internal server error during similarity search';
    if (error instanceof z.ZodError) {
        errorMessage = 'Invalid request payload.';
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message || error.toString() }, { status: 500 });
  }
}
