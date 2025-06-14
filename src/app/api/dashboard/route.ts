
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, Repository, connectMongoose } from '@/lib/mongodb'; // Added Repository
import type { DashboardData, RecentAnalysisItem, QualityTrendItem, DashboardOverview, TopIssueItem, SecurityIssue, Suggestion, SecurityHotspotItem, TeamMemberMetric, FileAnalysisItem, PullRequest as PRType, CodeAnalysis as AnalysisDocType, Repository as RepoType, ConnectedRepositoryItem } from '@/types';
import mongoose from 'mongoose';


const MAX_TOP_ISSUES = 5;
const MAX_HOTSPOTS = 5;
const MAX_TEAM_MEMBERS = 10;
const MAX_CONNECTED_REPOS_ON_DASHBOARD = 5;
const MAX_RECENT_ANALYSES = 5;

function getTopItems(
  analyses: any[],
  itemSelector: (analysis: any) => (SecurityIssue[] | Suggestion[]),
  titleExtractor: (item: SecurityIssue | Suggestion) => string,
  severityExtractor?: (item: SecurityIssue) => SecurityIssue['severity'],
  priorityExtractor?: (item: Suggestion) => Suggestion['priority'],
  typeExtractor?: (item: SecurityIssue | Suggestion) => Suggestion['type'] | SecurityIssue['type']
): TopIssueItem[] {
  const itemCounts: Record<string, TopIssueItem> = {};

  analyses.forEach(analysis => {
    if (!analysis) return;
    const items = itemSelector(analysis) || [];
    items.forEach((item: SecurityIssue | Suggestion) => {
      if (!item || !item.title) return;
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

    let relevantAnalysesQuery: mongoose.FilterQuery<AnalysisDocType> = {};
    if (isAdmin) {
      // Admins see all analyses
    } else {
      // Users see analyses linked to their PRs
      const userPullRequestObjects = await PullRequest.find({ userId }).select('_id').lean();
      const userPullRequestIds = userPullRequestObjects.map(pr => pr._id);
      if (userPullRequestIds.length === 0 && !isAdmin) { // Handle no PRs for user early
         const userRepos = await Repository.find({ userId })
          .sort({ updatedAt: -1 })
          .limit(MAX_CONNECTED_REPOS_ON_DASHBOARD)
          .lean();
        const connectedRepositories = userRepos.map(repo => ({
          _id: repo._id.toString(),
          fullName: repo.fullName,
          language: repo.language,
          owner: repo.owner,
          name: repo.name,
          updatedAt: repo.updatedAt,
        }));
        return NextResponse.json({
            overview: { totalAnalyses: 0, avgQualityScore: 0, securityIssuesCount: 0, trendsUp: false },
            recentAnalyses: [],
            qualityTrends: [],
            topSecurityIssues: [],
            topSuggestions: [],
            securityHotspots: [],
            teamMetrics: [],
            connectedRepositories,
        } as DashboardData);
      }
      relevantAnalysesQuery = { pullRequestId: { $in: userPullRequestIds } };
    }

    const relevantAnalyses = await Analysis.find(relevantAnalysesQuery)
      .populate<{ pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null }>({
        path: 'pullRequestId',
        select: 'title repositoryId number author createdAt owner repoName state',
        populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' }
      })
      .sort({ createdAt: -1 }) // Sort by analysis creation date, descending
      .lean() as (AnalysisDocType & { pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null })[];

    let connectedRepositories: ConnectedRepositoryItem[] = [];
    if (!isAdmin) {
      const userRepos = await Repository.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(MAX_CONNECTED_REPOS_ON_DASHBOARD)
        .lean();
      connectedRepositories = userRepos.map(repo => ({
        _id: repo._id.toString(),
        fullName: repo.fullName,
        language: repo.language,
        owner: repo.owner,
        name: repo.name,
        updatedAt: repo.updatedAt,
      }));
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
            connectedRepositories,
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

    const recentAnalysesDocs = relevantAnalyses.slice(0, MAX_RECENT_ANALYSES);

    const recentAnalyses: RecentAnalysisItem[] = recentAnalysesDocs.map((analysis) => {
      if (!analysis || !analysis.pullRequestId) return null;

      let repoFullNameDisplay = 'N/A';
      let ownerDisplay = analysis.pullRequestId.owner || 'N/A';
      let actualRepoName = analysis.pullRequestId.repoName || 'N/A';

      if (analysis.pullRequestId.repositoryId && typeof analysis.pullRequestId.repositoryId === 'object' && analysis.pullRequestId.repositoryId.fullName) {
        const repoObj = analysis.pullRequestId.repositoryId as RepoType;
        repoFullNameDisplay = repoObj.fullName;
        ownerDisplay = repoObj.owner || ownerDisplay;
        actualRepoName = repoObj.name || actualRepoName;
      } else if (ownerDisplay !== 'N/A' && actualRepoName !== 'N/A') {
        repoFullNameDisplay = `${ownerDisplay}/${actualRepoName}`;
      }

      return {
        id: analysis._id.toString(), // This is the analysisId
        pullRequestTitle: analysis.pullRequestId.title || 'N/A',
        repositoryName: repoFullNameDisplay, // Full name like "owner/repo" for display
        prNumber: analysis.pullRequestId.number,
        owner: ownerDisplay, // Extracted owner for link construction
        repo: actualRepoName,  // Extracted repoName (short name) for link construction
        qualityScore: analysis.qualityScore || 0,
        securityIssues: (analysis.securityIssues || []).filter((si: SecurityIssue) => si.severity === 'critical' || si.severity === 'high').length,
        createdAt: analysis.createdAt, // Analysis creation date
      };
    }).filter(Boolean) as RecentAnalysisItem[];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const qualityTrendsData = relevantAnalyses.filter(a => a && new Date(a.createdAt) >= thirtyDaysAgo);
    const qualityTrendsAggMap: Record<string, { totalQuality: number, count: number }> = {};

    qualityTrendsData.forEach((analysis) => {
        if (!analysis) return;
        const dateStr = new Date(analysis.createdAt).toISOString().split('T')[0];
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

    let trendsUp = false;
    if (qualityTrends.length === 0 && totalAnalyses > 0 && avgQualityScore > 0) {
        trendsUp = avgQualityScore >= 7.0; // Base trend on overall average if no recent daily data
    } else if (qualityTrends.length === 1) {
        trendsUp = qualityTrends[0].quality >= 7.0;
    } else if (qualityTrends.length >= 2) {
        const lastScore = qualityTrends[qualityTrends.length -1].quality;
        const secondLastScore = qualityTrends[qualityTrends.length -2].quality;
        trendsUp = lastScore >= secondLastScore;
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
        const fileKey = file.filename;

        if (!fileIssueCounts[fileKey]) {
          fileIssueCounts[fileKey] = {
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
        fileIssueCounts[fileKey].criticalIssues += fileCritical;
        fileIssueCounts[fileKey].highIssues += fileHigh;
        fileIssueCounts[fileKey].totalIssuesInFile += (file.securityIssues || []).length;

        const currentAnalysisDate = new Date(analysis.createdAt);
        if (!fileIssueCounts[fileKey].lastOccurrence || currentAnalysisDate > fileIssueCounts[fileKey].lastOccurrence) {
            fileIssueCounts[fileKey].lastOccurrence = currentAnalysisDate;
        }

        if (analysis.pullRequestId?._id && !fileIssueCounts[fileKey].relatedPrIds.includes(analysis.pullRequestId._id.toString())) {
             fileIssueCounts[fileKey].relatedPrIds.push(analysis.pullRequestId._id.toString());
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
      connectedRepositories,
    };

    return NextResponse.json(dashboardData);
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error, error.stack);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

