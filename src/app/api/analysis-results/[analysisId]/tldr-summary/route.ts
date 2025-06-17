
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, connectMongoose } from '@/lib/mongodb';
import { summarizePrAnalysis, type SummarizePrAnalysisInput } from '@/ai/flows/summarize-pr-analysis-flow';
import mongoose from 'mongoose';
import type { CodeAnalysis, PullRequest as PRType, FileAnalysisItem, SecurityIssue, Suggestion } from '@/types';

export async function GET(
  request: NextRequest,
  context: { params: { analysisId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const analysisId = context.params.analysisId;
    if (!analysisId || !mongoose.Types.ObjectId.isValid(analysisId)) {
      return NextResponse.json({ error: 'Invalid Analysis ID' }, { status: 400 });
    }

    const analysisDoc = await Analysis.findById(analysisId)
      .populate<{ pullRequestId: PRType | null }>('pullRequestId')
      .lean() as (CodeAnalysis & { pullRequestId: PRType | null }) | null;

    if (!analysisDoc) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }
    if (!analysisDoc.pullRequestId) {
      return NextResponse.json({ error: 'Associated Pull Request not found for this analysis' }, { status: 404 });
    }
    
    // Check permissions
     if (session.user.role !== 'admin' && analysisDoc.pullRequestId.userId !== session.user.id) {
        return NextResponse.json({ error: 'Access to this analysis is denied' }, { status: 403 });
    }


    const prTitle = analysisDoc.pullRequestId.title || `PR #${analysisDoc.pullRequestId.number}`;
    const overallQualityScore = analysisDoc.qualityScore;
    const totalCriticalIssues = (analysisDoc.securityIssues || []).filter((s: SecurityIssue) => s.severity === 'critical').length;
    const totalHighIssues = (analysisDoc.securityIssues || []).filter((s: SecurityIssue) => s.severity === 'high').length;
    const totalSuggestions = (analysisDoc.suggestions || []).length;
    const fileCount = (analysisDoc.fileAnalyses || []).length;
    const perFileSummaries = (analysisDoc.fileAnalyses || []).map((fa: FileAnalysisItem) => ({
      filename: fa.filename,
      insight: fa.aiInsights || '',
    }));

    const flowInput: SummarizePrAnalysisInput = {
      prTitle,
      overallQualityScore,
      totalCriticalIssues,
      totalHighIssues,
      totalSuggestions,
      fileCount,
      perFileSummaries,
      tldrMode: true, // Explicitly request TL;DR
    };

    const tldrResult = await summarizePrAnalysis(flowInput);

    return NextResponse.json({ tldrSummary: tldrResult.prSummary });

  } catch (error: any) {
    console.error(`Error fetching TL;DR summary for analysis ${context.params.analysisId}:`, error);
    let errorMessage = 'Internal server error';
    if (error.message.toLowerCase().includes('genkit') || error.message.toLowerCase().includes('ai model')) {
        errorMessage = `AI processing error: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
