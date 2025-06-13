
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, connectMongoose } from '@/lib/mongodb';
import { findSimilarCode } from '@/lib/vector-search';
import mongoose from 'mongoose';
import type { SimilarCodeResult } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { queryAnalysisId, queryFilename } = await request.json();

    if (!queryAnalysisId || !mongoose.Types.ObjectId.isValid(queryAnalysisId)) {
      return NextResponse.json({ error: 'Invalid or missing queryAnalysisId' }, { status: 400 });
    }
    if (!queryFilename || typeof queryFilename !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing queryFilename' }, { status: 400 });
    }

    // Fetch the Analysis document to get the vector embedding of the query file
    const sourceAnalysis = await Analysis.findById(queryAnalysisId).lean();

    if (!sourceAnalysis) {
      return NextResponse.json({ error: 'Source analysis not found' }, { status: 404 });
    }

    const sourceFileAnalysis = sourceAnalysis.fileAnalyses?.find(
      (fa) => fa.filename === queryFilename
    );

    if (!sourceFileAnalysis) {
      return NextResponse.json({ error: `File ${queryFilename} not found in source analysis` }, { status: 404 });
    }

    if (!sourceFileAnalysis.vectorEmbedding || sourceFileAnalysis.vectorEmbedding.length === 0) {
      return NextResponse.json({ error: `No vector embedding found for ${queryFilename} in source analysis. Cannot perform similarity search.` }, { status: 400 });
    }
    
    if (sourceFileAnalysis.vectorEmbedding.length !== 768) {
      return NextResponse.json({ error: `Vector embedding for ${queryFilename} has incorrect dimensions (${sourceFileAnalysis.vectorEmbedding.length} instead of 768).` }, { status: 400 });
    }


    const similarCodeResults: SimilarCodeResult[] = await findSimilarCode(
      sourceFileAnalysis.vectorEmbedding,
      5, // limit
      0.8, // similarityThreshold
      queryAnalysisId,
      queryFilename
    );

    return NextResponse.json({ results: similarCodeResults });

  } catch (error: any) {
    console.error('Error in /api/search/similar-code:', error);
    return NextResponse.json({ error: 'Internal server error during similarity search', details: error.message }, { status: 500 });
  }
}


