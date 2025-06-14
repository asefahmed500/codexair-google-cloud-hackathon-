
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

  analyses.forEach(analysisDoc => { // Renamed analysis to analysisDoc for clarity
    if (!analysisDoc) return;
    const items = itemSelector(analysisDoc) || [];
    items.forEach((item: SecurityIssue | Suggestion) => {
      if (!item || !item.title) return;
      const title = titleExtractor(item);
      if (!itemCounts[title]) {
        itemCounts[title] = { title, count: 0 };
        // Ensure correct type casting for accessing specific properties
        if (severityExtractor && 'severity' in item && (item as SecurityIssue).severity) {
            itemCounts[title].severity = severityExtractor(item as SecurityIssue);
        }
        if (priorityExtractor && 'priority' in item && (item as Suggestion).priority) {
            itemCounts[title].priority = priorityExtractor(item as Suggestion);
        }
        if (typeExtractor && item.type) {
            itemCounts[title].type = typeExtractor(item);
        }
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
        select: 'title repositoryId number author createdAt owner repoName state', // Added owner, repoName from PR doc
        populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' } // Keep this for full repo details if available
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

    const recentAnalyses: RecentAnalysisItem[] = recentAnalysesDocs.map((analysisDoc) => { // Renamed analysis to analysisDoc
      if (!analysisDoc || !analysisDoc.pullRequestId) return null;

      const pr = analysisDoc.pullRequestId;
      let repoFullNameDisplay = 'N/A';
      let ownerDisplay = 'N/A';
      let actualRepoName = 'N/A';

      if (pr.repositoryId && typeof pr.repositoryId === 'object' && pr.repositoryId.fullName) {
        const repoObj = pr.repositoryId as RepoType;
        repoFullNameDisplay = repoObj.fullName;
        ownerDisplay = repoObj.owner || pr.owner || 'N/A'; // Fallback to PR's owner
        actualRepoName = repoObj.name || pr.repoName || 'N/A'; // Fallback to PR's repoName
      } else if (pr.owner && pr.repoName) { // Fallback if repositoryId not populated fully
        repoFullNameDisplay = `${pr.owner}/${pr.repoName}`;
        ownerDisplay = pr.owner;
        actualRepoName = pr.repoName;
      }


      return {
        id: analysisDoc._id.toString(), // This is the analysisId
        pullRequestTitle: pr.title || 'N/A',
        repositoryName: repoFullNameDisplay, // Full name like "owner/repo" for display
        prNumber: pr.number,
        owner: ownerDisplay, 
        repo: actualRepoName,  
        qualityScore: analysisDoc.qualityScore || 0,
        securityIssues: (analysisDoc.securityIssues || []).filter((si: SecurityIssue) => si.severity === 'critical' || si.severity === 'high').length,
        createdAt: analysisDoc.createdAt, // Analysis creation date
      };
    }).filter(Boolean) as RecentAnalysisItem[];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const qualityTrendsData = relevantAnalyses.filter(a => a && new Date(a.createdAt) >= thirtyDaysAgo);
    const qualityTrendsAggMap: Record<string, { totalQuality: number, count: number }> = {};

    qualityTrendsData.forEach((analysisDoc) => { // Renamed analysis to analysisDoc
        if (!analysisDoc) return;
        const dateStr = new Date(analysisDoc.createdAt).toISOString().split('T')[0];
        if (!qualityTrendsAggMap[dateStr]) {
            qualityTrendsAggMap[dateStr] = { totalQuality: 0, count: 0 };
        }
        qualityTrendsAggMap[dateStr].totalQuality += (analysisDoc.qualityScore || 0);
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
    if (qualityTrends.length === 0) {
        trendsUp = false; // No data for trend
    } else if (qualityTrends.length === 1) {
        trendsUp = qualityTrends[0].quality >= 7.0; // Trend is "up" if the single score is good
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
      undefined, // no priorityExtractor for security issues
      item => item.type // 'vulnerability', 'warning', 'info'
    );

    const topSuggestions = getTopItems(
      relevantAnalyses,
      a => a?.suggestions,
      item => item.title,
      undefined, // no severityExtractor for suggestions
      item => item.priority,
      item => item.type // 'performance', 'style', etc.
    );

    const fileIssueCounts: Record<string, SecurityHotspotItem> = {};
    relevantAnalyses.forEach((analysisDoc) => { // Renamed analysis to analysisDoc
      if (!analysisDoc) return;
      (analysisDoc.fileAnalyses || []).forEach((file: FileAnalysisItem) => {
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

        const currentAnalysisDate = new Date(analysisDoc.createdAt);
        if (!fileIssueCounts[fileKey].lastOccurrence || currentAnalysisDate > fileIssueCounts[fileKey].lastOccurrence) {
            fileIssueCounts[fileKey].lastOccurrence = currentAnalysisDate;
        }

        if (analysisDoc.pullRequestId?._id && !fileIssueCounts[fileKey].relatedPrIds.includes(analysisDoc.pullRequestId._id.toString())) {
             fileIssueCounts[fileKey].relatedPrIds.push(analysisDoc.pullRequestId._id.toString());
        }
      });
    });
    const securityHotspots = Object.values(fileIssueCounts)
      .filter(f => f.criticalIssues > 0 || f.highIssues > 0)
      .sort((a, b) => b.criticalIssues - a.criticalIssues || b.highIssues - a.highIssues || b.totalIssuesInFile - a.totalIssuesInFile)
      .slice(0, MAX_HOTSPOTS);

    const memberMetrics: Record<string, TeamMemberMetric> = {};
    relevantAnalyses.forEach((analysisDoc) => { // Renamed analysis to analysisDoc
        if (!analysisDoc || !analysisDoc.pullRequestId) return;
        const authorLogin = analysisDoc.pullRequestId.author?.login;
        if (!authorLogin) return;

        if (!memberMetrics[authorLogin]) {
            memberMetrics[authorLogin] = {
                userId: authorLogin, // This is the GitHub login
                userName: authorLogin, // Display name, could be enhanced if we fetch GitHub user's display name
                userAvatar: analysisDoc.pullRequestId.author?.avatar,
                totalAnalyses: 0,
                avgQualityScore: 0,
                totalCriticalIssues: 0,
                totalHighIssues: 0,
            };
        }
        memberMetrics[authorLogin].totalAnalyses++;
        memberMetrics[authorLogin].avgQualityScore += (analysisDoc.qualityScore || 0);
        (analysisDoc.securityIssues || []).forEach((si: SecurityIssue) => {
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

    
