
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, Repository, connectMongoose } from '@/lib/mongodb'; // Added Repository
import type { DashboardData, RecentAnalysisItem, QualityTrendItem, DashboardOverview, TopIssueItem, SecurityIssue, Suggestion, SecurityHotspotItem, TeamMemberMetric, FileAnalysisItem, PullRequest as PRType, CodeAnalysis as AnalysisDocType, Repository as RepoType } from '@/types';
import mongoose from 'mongoose';


const MAX_TOP_ISSUES = 5;
const MAX_HOTSPOTS = 5;
const MAX_TEAM_MEMBERS = 10; // For admin view, might show more if desired

function getTopItems(
  analyses: any[], // Should be Array<AnalysisDocType & { pullRequestId: PRType | null}>
  itemSelector: (analysis: any) => (SecurityIssue[] | Suggestion[]),
  titleExtractor: (item: SecurityIssue | Suggestion) => string,
  severityExtractor?: (item: SecurityIssue) => SecurityIssue['severity'],
  priorityExtractor?: (item: Suggestion) => Suggestion['priority'],
  typeExtractor?: (item: SecurityIssue | Suggestion) => Suggestion['type'] | Suggestion['type']
): TopIssueItem[] {
  const itemCounts: Record<string, TopIssueItem> = {};

  analyses.forEach(analysis => {
    if (!analysis) return; 
    const items = itemSelector(analysis) || [];
    items.forEach((item: SecurityIssue | Suggestion) => {
      if (!item || !item.title) return; // Ensure item and title exist
      const title = titleExtractor(item);
      if (!itemCounts[title]) {
        itemCounts[title] = { title, count: 0 };
        if (severityExtractor && 'severity' in item && item.severity) itemCounts[title].severity = severityExtractor(item as SecurityIssue);
        if (priorityExtractor && 'priority' in item && item.priority) itemCounts[title].priority = priorityExtractor(item as Suggestion);
        if (typeExtractor && item.type) itemCounts[title].type = typeExtractor(item);
      }
      itemCounts[title].count++;
    });
  });

  return Object.values(itemCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TOP_ISSUES);
}


export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();
    const userId = session.user.id;
    const isAdmin = session.user.role === 'admin';

    let relevantAnalyses: (AnalysisDocType & { pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null })[];

    if (isAdmin) {
      relevantAnalyses = await Analysis.find({})
        .populate<{ pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null }>({
          path: 'pullRequestId',
          select: 'title repositoryId number author createdAt owner repoName state', // ensure owner, repoName, state are selected
          populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' } 
        })
        .sort({ createdAt: -1 }) 
        .lean() as (AnalysisDocType & { pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null })[];
    } else {
      const userPullRequestObjects = await PullRequest.find({ userId }).select('_id').lean();
      const userPullRequestIds = userPullRequestObjects.map(pr => pr._id);
      
      if (userPullRequestIds.length === 0) {
           return NextResponse.json({
            overview: { totalAnalyses: 0, avgQualityScore: 0, securityIssuesCount: 0, trendsUp: false },
            recentAnalyses: [],
            qualityTrends: [],
            topSecurityIssues: [],
            topSuggestions: [],
            securityHotspots: [],
            teamMetrics: [],
        } as DashboardData);
      }

      relevantAnalyses = await Analysis.find({ pullRequestId: { $in: userPullRequestIds } })
        .populate<{ pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null }>({
          path: 'pullRequestId',
          select: 'title repositoryId number author createdAt owner repoName state', // ensure owner, repoName, state are selected
          populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' }
        })
        .sort({ createdAt: -1 }) 
        .lean() as (AnalysisDocType & { pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null })[];
    }
    
    if (relevantAnalyses.length === 0 && !isAdmin) { 
        return NextResponse.json({
            overview: { totalAnalyses: 0, avgQualityScore: 0, securityIssuesCount: 0, trendsUp: false },
            recentAnalyses: [],
            qualityTrends: [],
            topSecurityIssues: [],
            topSuggestions: [],
            securityHotspots: [],
            teamMetrics: [],
        } as DashboardData);
    }


    const totalAnalyses = relevantAnalyses.length;

    const avgQualityScore = totalAnalyses > 0
      ? relevantAnalyses.reduce((sum, a) => sum + (a?.qualityScore || 0), 0) / totalAnalyses
      : 0;

    const securityIssuesCount = relevantAnalyses.reduce((sum, a) => {
        if (!a) return sum;
        const criticalHigh = (a.securityIssues || []).filter(si => si.severity === 'critical' || si.severity === 'high');
        return sum + criticalHigh.length;
    }, 0);

    const recentAnalysesDocs = relevantAnalyses.slice(0, 5);

    const recentAnalyses: RecentAnalysisItem[] = recentAnalysesDocs.map((analysis) => {
      if (!analysis || !analysis.pullRequestId) return null; 

      let repoFullNameDisplay = 'N/A';
      let ownerDisplay = analysis.pullRequestId.owner || 'N/A'; // From PR doc
      let actualRepoName = analysis.pullRequestId.repoName || 'N/A'; // From PR doc

      // If repositoryId is populated and an object, use its details
      if (analysis.pullRequestId.repositoryId && typeof analysis.pullRequestId.repositoryId === 'object') {
        const repoObj = analysis.pullRequestId.repositoryId as RepoType;
        if (repoObj.fullName) repoFullNameDisplay = repoObj.fullName;
        // If owner/repoName are directly on PR doc, they might be more reliable or up-to-date for the specific PR instance
        // if (repoObj.owner) ownerDisplay = repoObj.owner; 
        // if (repoObj.name) actualRepoName = repoObj.name;
      }
      
      return {
        id: analysis._id.toString(),
        pullRequestTitle: analysis.pullRequestId.title || 'N/A',
        repositoryName: repoFullNameDisplay, // This is fullName, e.g., "owner/repo"
        prNumber: analysis.pullRequestId.number,
        owner: ownerDisplay, 
        repo: actualRepoName,
        qualityScore: analysis.qualityScore || 0,
        securityIssues: (analysis.securityIssues || []).filter((si: SecurityIssue) => si.severity === 'critical' || si.severity === 'high').length,
        createdAt: analysis.createdAt,
      };
    }).filter(Boolean) as RecentAnalysisItem[];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const qualityTrendsData = relevantAnalyses.filter(a => a && new Date(a.createdAt) >= thirtyDaysAgo);
    const qualityTrendsAggMap: Record<string, { totalQuality: number, count: number }> = {};

    qualityTrendsData.forEach((analysis) => {
        if (!analysis) return;
        const dateStr = new Date(analysis.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
        if (!qualityTrendsAggMap[dateStr]) {
            qualityTrendsAggMap[dateStr] = { totalQuality: 0, count: 0 };
        }
        qualityTrendsAggMap[dateStr].totalQuality += (analysis.qualityScore || 0);
        qualityTrendsAggMap[dateStr].count++;
    });

    const qualityTrends: QualityTrendItem[] = Object.entries(qualityTrendsAggMap)
        .map(([date, data]) => ({
            date,
            quality: parseFloat((data.totalQuality / data.count).toFixed(1)),
            count: data.count,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let trendsUp = true;
    if (qualityTrends.length >= 2) {
        const lastScore = qualityTrends[qualityTrends.length -1].quality;
        const secondLastScore = qualityTrends[qualityTrends.length -2].quality;
        trendsUp = lastScore >= secondLastScore;
    } else if (qualityTrends.length === 1){
        trendsUp = qualityTrends[0].quality >= 7; 
    }

    const overview: DashboardOverview = {
      totalAnalyses,
      avgQualityScore: parseFloat(avgQualityScore.toFixed(1)),
      securityIssuesCount,
      trendsUp,
    };

    const topSecurityIssues = getTopItems(
      relevantAnalyses,
      a => a?.securityIssues,
      item => item.title,
      item => item.severity,
      undefined,
      item => item.type
    );

    const topSuggestions = getTopItems(
      relevantAnalyses,
      a => a?.suggestions,
      item => item.title,
      undefined,
      item => item.priority,
      item => item.type
    );

    const fileIssueCounts: Record<string, SecurityHotspotItem> = {};
    relevantAnalyses.forEach((analysis) => {
      if (!analysis) return;
      (analysis.fileAnalyses || []).forEach((file: FileAnalysisItem) => {
        if (!file.filename) return;
        const uniqueKey = `${analysis.pullRequestId?._id?.toString() || 'unknown_pr'}-${file.filename}`; 

        if (!fileIssueCounts[file.filename]) {
          fileIssueCounts[file.filename] = {
            filename: file.filename,
            criticalIssues: 0,
            highIssues: 0,
            totalIssuesInFile: 0,
            relatedPrIds: [],
            lastOccurrence: new Date(0),
          };
        }
        let fileCritical = 0;
        let fileHigh = 0;
        (file.securityIssues || []).forEach(issue => {
          if (issue.severity === 'critical') fileCritical++;
          if (issue.severity === 'high') fileHigh++;
        });
        fileIssueCounts[file.filename].criticalIssues += fileCritical;
        fileIssueCounts[file.filename].highIssues += fileHigh;
        fileIssueCounts[file.filename].totalIssuesInFile += (file.securityIssues || []).length;
        
        const currentAnalysisDate = new Date(analysis.createdAt);
        if (!fileIssueCounts[file.filename].lastOccurrence || currentAnalysisDate > fileIssueCounts[file.filename].lastOccurrence) {
            fileIssueCounts[file.filename].lastOccurrence = currentAnalysisDate;
        }

        if (analysis.pullRequestId?._id && !fileIssueCounts[file.filename].relatedPrIds.includes(analysis.pullRequestId._id.toString())) {
             fileIssueCounts[file.filename].relatedPrIds.push(analysis.pullRequestId._id.toString());
        }
      });
    });
    const securityHotspots = Object.values(fileIssueCounts)
      .filter(f => f.criticalIssues > 0 || f.highIssues > 0)
      .sort((a, b) => b.criticalIssues - a.criticalIssues || b.highIssues - a.highIssues || b.totalIssuesInFile - a.totalIssuesInFile)
      .slice(0, MAX_HOTSPOTS);

    const memberMetrics: Record<string, TeamMemberMetric> = {};
    relevantAnalyses.forEach((analysis) => {
        if (!analysis || !analysis.pullRequestId) return;
        const authorLogin = analysis.pullRequestId.author?.login;
        if (!authorLogin) return;

        if (!memberMetrics[authorLogin]) {
            memberMetrics[authorLogin] = {
                userId: authorLogin, 
                userName: authorLogin,
                userAvatar: analysis.pullRequestId.author?.avatar,
                totalAnalyses: 0,
                avgQualityScore: 0,
                totalCriticalIssues: 0,
                totalHighIssues: 0,
            };
        }
        memberMetrics[authorLogin].totalAnalyses++;
        memberMetrics[authorLogin].avgQualityScore += (analysis.qualityScore || 0);
        (analysis.securityIssues || []).forEach((si: SecurityIssue) => {
            if (si.severity === 'critical') memberMetrics[authorLogin].totalCriticalIssues++;
            if (si.severity === 'high') memberMetrics[authorLogin].totalHighIssues++;
        });
    });

    const teamMetrics = Object.values(memberMetrics).map(member => ({
        ...member,
        avgQualityScore: member.totalAnalyses > 0 ? parseFloat((member.avgQualityScore / member.totalAnalyses).toFixed(1)) : 0,
    }))
    .sort((a,b) => b.totalAnalyses - a.totalAnalyses || b.avgQualityScore - a.avgQualityScore)
    .slice(0, isAdmin ? MAX_TEAM_MEMBERS * 2 : MAX_TEAM_MEMBERS); 


    const dashboardData: DashboardData = {
      overview,
      recentAnalyses,
      qualityTrends,
      topSecurityIssues,
      topSuggestions,
      securityHotspots,
      teamMetrics,
    };

    return NextResponse.json(dashboardData);
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error, error.stack);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
