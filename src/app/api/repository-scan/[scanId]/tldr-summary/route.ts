
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { RepositoryScan, connectMongoose } from '@/lib/mongodb';
import { summarizePrAnalysis, type SummarizePrAnalysisInput } from '@/ai/flows/summarize-pr-analysis-flow';
import mongoose from 'mongoose';
import type { RepositoryScanResult as ScanDocType, FileAnalysisItem, SecurityIssue, Suggestion } from '@/types';

export async function GET(
  request: NextRequest,
  context: { params: { scanId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const scanId = context.params.scanId;
    if (!scanId || !mongoose.Types.ObjectId.isValid(scanId)) {
      return NextResponse.json({ error: 'Invalid Scan ID' }, { status: 400 });
    }

    const query: mongoose.FilterQuery<any> = { _id: scanId };
    if (session.user.role !== 'admin') {
      query.userId = session.user.id;
    }
    const scanDoc = await RepositoryScan.findOne(query).lean() as ScanDocType | null;

    if (!scanDoc) {
      return NextResponse.json({ error: 'Repository scan not found or access denied' }, { status: 404 });
    }
    
    const scanTitle = `${scanDoc.owner}/${scanDoc.repoName} (Scan - ${scanDoc.branchAnalyzed} branch)`;
    const overallQualityScore = scanDoc.qualityScore;
    const totalCriticalIssues = (scanDoc.securityIssues || []).filter((s: SecurityIssue) => s.severity === 'critical').length;
    const totalHighIssues = (scanDoc.securityIssues || []).filter((s: SecurityIssue) => s.severity === 'high').length;
    const totalSuggestions = (scanDoc.suggestions || []).length;
    const fileCount = (scanDoc.fileAnalyses || []).length;
    const perFileSummaries = (scanDoc.fileAnalyses || []).map((fa: FileAnalysisItem) => ({
      filename: fa.filename,
      insight: fa.aiInsights || '',
    }));

    const flowInput: SummarizePrAnalysisInput = {
      prTitle: scanTitle,
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
    console.error(`Error fetching TL;DR summary for scan ${context.params.scanId}:`, error);
    let errorMessage = 'Internal server error';
     if (error.message.toLowerCase().includes('genkit') || error.message.toLowerCase().includes('ai model')) {
        errorMessage = `AI processing error: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
