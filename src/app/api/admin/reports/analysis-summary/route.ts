
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PullRequest, Analysis, connectMongoose, Repository } from '@/lib/mongodb';
import type { AnalysisReportItem, SecurityIssue, PullRequest as PRType, CodeAnalysis as AnalysisDocType, Repository as RepoType } from '@/types';
import mongoose from 'mongoose';


interface PopulatedPR extends Omit<PRType, 'analysis' | 'repositoryId'> {
  _id: mongoose.Types.ObjectId; 
  analysis: AnalysisDocType | null;
  repositoryId: RepoType | null; 
}


export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const pullRequestsWithAnalyses = await PullRequest.find({ analysis: { $exists: true, $ne: null } })
      .populate<{ analysis: AnalysisDocType | null }>('analysis')
      .populate<{ repositoryId: RepoType | null }>({ path: 'repositoryId', model: 'Repository', select: 'fullName owner name' })
      .sort({ createdAt: -1 })
      .lean() as PopulatedPR[];

    const reportItems: AnalysisReportItem[] = pullRequestsWithAnalyses.map((pr) => {
      const analysis = pr.analysis;
      
      let criticalIssuesCount = 0;
      let highIssuesCount = 0;
      
      if (analysis && analysis.securityIssues) {
        analysis.securityIssues.forEach((issue: SecurityIssue) => {
          if (issue.severity === 'critical') criticalIssuesCount++;
          if (issue.severity === 'high') highIssuesCount++;
        });
      }
      
      let repoFullName = "N/A";
      let ownerName = pr.owner || "N/A"; // from PR schema directly
      let actualRepoName = pr.repoName || "N/A"; // from PR schema directly

      if (pr.repositoryId && pr.repositoryId.fullName) {
          repoFullName = pr.repositoryId.fullName;
          // Override with more specific data if repositoryId is populated
          if (pr.repositoryId.owner) ownerName = pr.repositoryId.owner;
          if (pr.repositoryId.name) actualRepoName = pr.repositoryId.name;
      } else if (pr.owner && pr.repoName) { 
          repoFullName = `${pr.owner}/${pr.repoName}`;
      }


      return {
        prId: pr._id.toString(),
        prNumber: pr.number,
        prTitle: pr.title,
        repositoryFullName: repoFullName, // For display
        owner: ownerName, // For link construction
        repoName: actualRepoName, // For link construction
        prAuthor: pr.author?.login || 'N/A',
        analysisDate: analysis?.createdAt || pr.updatedAt, 
        qualityScore: analysis?.qualityScore !== undefined && analysis.qualityScore !== null ? parseFloat(analysis.qualityScore.toFixed(1)) : null,
        criticalIssuesCount,
        highIssuesCount,
        analysisId: analysis?._id?.toString(),
      };
    });

    return NextResponse.json({ reportItems });

  } catch (error: any) {
    console.error('Error generating analysis summary report:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
    

    

