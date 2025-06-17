
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PullRequest, Analysis, Repository, connectMongoose, AuditLog, type AuditLogActionType } from '@/lib/mongodb';
import type { AnalysisReportItem, SecurityIssue, PullRequest as PRType, CodeAnalysis as AnalysisDocType, Repository as RepoType } from '@/types';
import mongoose from 'mongoose';


interface PopulatedPR extends Omit<PRType, 'analysis' | 'repositoryId'> {
  _id: mongoose.Types.ObjectId; 
  analysis: AnalysisDocType | null;
  // repositoryId is a string in the PR schema, so it won't be a populated RepoType object here
  // We will fetch Repository details separately if needed, or rely on pr.owner/pr.repoName
}


export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin' || !session.user.id || !session.user.email) {
      return NextResponse.json({ error: 'Forbidden or invalid admin session' }, { status: 403 });
    }

    await connectMongoose();

    // Fetch PullRequests and populate their 'analysis' field.
    // repositoryId is a string in PullRequest schema, so direct population is not effective here.
    // We will rely on pr.owner and pr.repoName stored on the PR document.
    const pullRequestsWithAnalyses = await PullRequest.find({ analysis: { $exists: true, $ne: null } })
      .populate<{ analysis: AnalysisDocType | null }>('analysis') 
      .sort({ createdAt: -1 })
      .lean();

    const reportItems: AnalysisReportItem[] = [];

    for (const pr of pullRequestsWithAnalyses as any[]) { // Using 'as any[]' for simplicity in loop, pr structure matches PRType
      const analysis = pr.analysis as AnalysisDocType | null;
      
      let criticalIssuesCount = 0;
      let highIssuesCount = 0;
      
      if (analysis && analysis.securityIssues) {
        analysis.securityIssues.forEach((issue: SecurityIssue) => {
          if (issue.severity === 'critical') criticalIssuesCount++;
          if (issue.severity === 'high') highIssuesCount++;
        });
      }
      
      // Use owner and repoName directly from the PullRequest document.
      // These are set when the analysis is triggered (see /api/analyze).
      const ownerName = pr.owner || "N/A"; 
      const actualRepoName = pr.repoName || "N/A"; 
      const repoFullName = (ownerName !== "N/A" && actualRepoName !== "N/A") ? `${ownerName}/${actualRepoName}` : "N/A";

      // Optional: If a more canonical fullName is desired from the Repository collection,
      // and pr.repositoryId (string of ObjectId) is reliable:
      // let finalRepoFullName = repoFullName;
      // if (pr.repositoryId && mongoose.Types.ObjectId.isValid(pr.repositoryId)) {
      //   const relatedRepo = await Repository.findById(pr.repositoryId).select('fullName').lean();
      //   if (relatedRepo && relatedRepo.fullName) {
      //     finalRepoFullName = relatedRepo.fullName;
      //   }
      // }

      reportItems.push({
        prId: pr._id.toString(),
        prNumber: pr.number,
        prTitle: pr.title || 'N/A',
        repositoryFullName: repoFullName, 
        owner: ownerName, 
        repoName: actualRepoName, 
        prAuthor: pr.author?.login || 'N/A',
        analysisDate: analysis?.createdAt || pr.updatedAt, 
        qualityScore: analysis?.qualityScore !== undefined && analysis.qualityScore !== null ? parseFloat(analysis.qualityScore.toFixed(1)) : null,
        criticalIssuesCount,
        highIssuesCount,
        analysisId: analysis?._id?.toString(),
      });
    }

    // Create audit log entry for fetching the report
    await new AuditLog({
        adminUserId: new mongoose.Types.ObjectId(session.user.id),
        adminUserEmail: session.user.email,
        action: 'ADMIN_ANALYSIS_SUMMARY_REPORT_FETCHED' as AuditLogActionType,
        details: { reportItemCount: reportItems.length },
        timestamp: new Date(),
    }).save();


    return NextResponse.json({ reportItems });

  } catch (error: any) {
    console.error('Error generating analysis summary report:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
    

    

