
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, Repository, RepositoryScan, connectMongoose } from '@/lib/mongodb'; 
import type { DashboardData, RecentAnalysisItem, QualityTrendItem, DashboardOverview, TopIssueItem, SecurityIssue, Suggestion, SecurityHotspotItem, TeamMemberMetric, FileAnalysisItem, PullRequest as PRType, CodeAnalysis as AnalysisDocType, Repository as RepoType, ConnectedRepositoryItem, RepositoryScanResult } from '@/types';
import mongoose from 'mongoose';


const MAX_TOP_ISSUES = 5;
const MAX_HOTSPOTS = 5;
const MAX_TEAM_MEMBERS = 10;
const MAX_CONNECTED_REPOS_ON_DASHBOARD = 5;
const MAX_RECENT_ANALYSES = 5;

interface GenericAnalyzedItem {
    _id: mongoose.Types.ObjectId;
    qualityScore?: number | null;
    securityIssues?: SecurityIssue[];
    suggestions?: Suggestion[];
    fileAnalyses?: FileAnalysisItem[];
    createdAt: Date;
    // For PR Analysis
    pullRequestId?: (PRType & {repositoryId: RepoType | string | null}) | null;
    // For Repo Scan
    owner?: string;
    repoName?: string;
    branchAnalyzed?: string;
    commitShaAnalyzed?: string;
    // Common discriminant
    analysisType: 'pr' | 'repo_scan';
}


function getTopItems(
  analyzedItems: GenericAnalyzedItem[],
  itemSelector: (item: GenericAnalyzedItem) => (SecurityIssue[] | Suggestion[] | undefined),
  titleExtractor: (item: SecurityIssue | Suggestion) => string,
  severityExtractor?: (item: SecurityIssue) => SecurityIssue['severity'],
  priorityExtractor?: (item: Suggestion) => Suggestion['priority'],
  typeExtractor?: (item: SecurityIssue | Suggestion) => Suggestion['type'] | SecurityIssue['type']
): TopIssueItem[] {
  const itemCounts: Record<string, TopIssueItem> = {};

  analyzedItems.forEach(analyzedDoc => {
    if (!analyzedDoc) return;
    const items = itemSelector(analyzedDoc) || [];
    items.forEach((item: SecurityIssue | Suggestion) => {
      if (!item || !item.title) return;
      const title = titleExtractor(item);
      if (!itemCounts[title]) {
        itemCounts[title] = { title, count: 0 };
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

    let allAnalyzedItems: GenericAnalyzedItem[] = [];

    // Fetch PR Analyses (Analysis documents)
    let prAnalysesQuery: mongoose.FilterQuery<AnalysisDocType> = {};
    if (!isAdmin) {
      const userPullRequestObjects = await PullRequest.find({ userId }).select('_id').lean();
      const userPullRequestIds = userPullRequestObjects.map(pr => pr._id);
      if (userPullRequestIds.length > 0) {
        prAnalysesQuery = { pullRequestId: { $in: userPullRequestIds } };
      } else {
        prAnalysesQuery = { _id: new mongoose.Types.ObjectId() }; // Empty query if no PRs
      }
    }
    const prAnalysisDocs = await Analysis.find(prAnalysesQuery)
      .populate<{ pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null }>({
        path: 'pullRequestId',
        select: 'title repositoryId number author createdAt owner repoName state',
        populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' }
      })
      .sort({ createdAt: -1 })
      .lean() as (AnalysisDocType & { pullRequestId: (PRType & {repositoryId: RepoType | string | null}) | null })[];

    prAnalysisDocs.forEach(doc => {
        if (doc.pullRequestId) { // Ensure PR exists for this analysis
            allAnalyzedItems.push({ ...doc, analysisType: 'pr' });
        }
    });

    // Fetch Repository Scans
    let repoScansQuery: mongoose.FilterQuery<RepositoryScanResult> = {};
    if (!isAdmin) {
      repoScansQuery = { userId: userId };
    }
    const repoScanDocs = await RepositoryScan.find(repoScansQuery)
      .populate<{ repositoryId: RepoType | null }>({ path: 'repositoryId', model: 'Repository', select: 'name fullName owner' })
      .sort({ createdAt: -1 })
      .lean() as (RepositoryScanResult & { repositoryId: RepoType | null })[];
      
    repoScanDocs.forEach(doc => {
        allAnalyzedItems.push({ ...doc, analysisType: 'repo_scan' });
    });
    
    // Sort all items together by creation date for consistent recent items and trends
    allAnalyzedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());


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
    
    if (allAnalyzedItems.length === 0 && !isAdmin && connectedRepositories.length === 0) {
        const emptyDashboardData: DashboardData = {
            overview: { totalAnalyses: 0, avgQualityScore: 0, securityIssuesCount: 0, trendsUp: false },
            recentAnalyses: [],
            qualityTrends: [],
            topSecurityIssues: [],
            topSuggestions: [],
            securityHotspots: [],
            teamMetrics: [],
            connectedRepositories,
        };
        return NextResponse.json(emptyDashboardData, {
          headers: {
            'Cache-Control': 'no-store, max-age=0, must-revalidate',
          },
        });
    }

    const totalAnalyses = allAnalyzedItems.length;
    const avgQualityScore = totalAnalyses > 0
      ? allAnalyzedItems.reduce((sum, a) => sum + (a?.qualityScore || 0), 0) / totalAnalyses
      : 0;

    const securityIssuesCount = allAnalyzedItems.reduce((sum, a) => {
        if (!a || !a.securityIssues) return sum;
        const criticalHigh = (a.securityIssues).filter(si => si.severity === 'critical' || si.severity === 'high');
        return sum + criticalHigh.length;
    }, 0);

    const recentCombinedAnalysesDocs = allAnalyzedItems.slice(0, MAX_RECENT_ANALYSES);
    const recentAnalyses: RecentAnalysisItem[] = recentCombinedAnalysesDocs.map((item) => {
      if (item.analysisType === 'pr' && item.pullRequestId) {
        const pr = item.pullRequestId;
        let repoFullNameDisplay = 'N/A';
        let ownerDisplay = 'N/A';
        let actualRepoName = 'N/A';

        if (pr.repositoryId && typeof pr.repositoryId === 'object' && pr.repositoryId.fullName) {
          const repoObj = pr.repositoryId as RepoType;
          repoFullNameDisplay = repoObj.fullName;
          ownerDisplay = repoObj.owner || pr.owner || 'N/A';
          actualRepoName = repoObj.name || pr.repoName || 'N/A';
        } else if (pr.owner && pr.repoName) {
          repoFullNameDisplay = `${pr.owner}/${pr.repoName}`;
          ownerDisplay = pr.owner;
          actualRepoName = pr.repoName;
        }
        
        return {
          id: item._id.toString(),
          type: 'pr',
          pullRequestTitle: pr.title || 'N/A',
          repositoryName: repoFullNameDisplay,
          prNumber: pr.number,
          owner: ownerDisplay,
          repo: actualRepoName,
          qualityScore: item.qualityScore || 0,
          securityIssues: (item.securityIssues || []).filter(si => si.severity === 'critical' || si.severity === 'high').length,
          createdAt: item.createdAt,
        };
      } else if (item.analysisType === 'repo_scan') {
        const scanRepo = item.repositoryId as RepoType | null; // Populated from RepositoryScan query
        return {
          id: item._id.toString(),
          type: 'repo_scan',
          repositoryName: scanRepo?.fullName || `${item.owner}/${item.repoName}`,
          owner: item.owner!,
          repo: item.repoName!,
          qualityScore: item.qualityScore || 0,
          securityIssues: (item.securityIssues || []).filter(si => si.severity === 'critical' || si.severity === 'high').length,
          createdAt: item.createdAt,
          branchAnalyzed: item.branchAnalyzed,
          commitShaAnalyzed: item.commitShaAnalyzed?.substring(0,7)
        };
      }
      return null;
    }).filter(Boolean) as RecentAnalysisItem[];


    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const qualityTrendsData = allAnalyzedItems.filter(a => a && new Date(a.createdAt) >= thirtyDaysAgo);
    const qualityTrendsAggMap: Record<string, { totalQuality: number, count: number }> = {};

    qualityTrendsData.forEach((item) => {
        if (!item) return;
        const dateStr = new Date(item.createdAt).toISOString().split('T')[0];
        if (!qualityTrendsAggMap[dateStr]) {
            qualityTrendsAggMap[dateStr] = { totalQuality: 0, count: 0 };
        }
        qualityTrendsAggMap[dateStr].totalQuality += (item.qualityScore || 0);
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
        trendsUp = false; 
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
      allAnalyzedItems,
      item => item?.securityIssues,
      secIssue => secIssue.title,
      secIssue => secIssue.severity,
      undefined, 
      secIssue => secIssue.type
    );

    const topSuggestions = getTopItems(
      allAnalyzedItems,
      item => item?.suggestions,
      sug => sug.title,
      undefined, 
      sug => sug.priority,
      sug => sug.type
    );

    const fileIssueCounts: Record<string, SecurityHotspotItem> = {};
    allAnalyzedItems.forEach((item) => {
      if (!item) return;
      (item.fileAnalyses || []).forEach((file: FileAnalysisItem) => {
        if (!file.filename) return;
        const fileKey = file.filename; // Assuming file.filename includes repo context if needed or is unique enough

        if (!fileIssueCounts[fileKey]) {
          fileIssueCounts[fileKey] = {
            filename: file.filename,
            criticalIssues: 0,
            highIssues: 0,
            totalIssuesInFile: 0,
            relatedPrIds: [], // Store analysis/scan IDs here
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

        const currentAnalysisDate = new Date(item.createdAt);
        if (!fileIssueCounts[fileKey].lastOccurrence || currentAnalysisDate > fileIssueCounts[fileKey].lastOccurrence) {
            fileIssueCounts[fileKey].lastOccurrence = currentAnalysisDate;
        }
        // Add current analysis/scan ID to related IDs
        if (item._id && !fileIssueCounts[fileKey].relatedPrIds.includes(item._id.toString())) {
             fileIssueCounts[fileKey].relatedPrIds.push(item._id.toString());
        }
      });
    });
    const securityHotspots = Object.values(fileIssueCounts)
      .filter(f => f.criticalIssues > 0 || f.highIssues > 0)
      .sort((a, b) => b.criticalIssues - a.criticalIssues || b.highIssues - a.highIssues || b.totalIssuesInFile - a.totalIssuesInFile)
      .slice(0, MAX_HOTSPOTS);

    // Team Metrics: Based on PR authors primarily. Repo scans are user-initiated, not author-specific in the same way.
    // So, for now, teamMetrics will primarily reflect PR analysis authors.
    const memberMetrics: Record<string, TeamMemberMetric> = {};
    prAnalysisDocs.forEach((analysisDoc) => {
        if (!analysisDoc || !analysisDoc.pullRequestId) return;
        const authorLogin = analysisDoc.pullRequestId.author?.login;
        if (!authorLogin) return;

        if (!memberMetrics[authorLogin]) {
            memberMetrics[authorLogin] = {
                userId: authorLogin,
                userName: authorLogin,
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

    return NextResponse.json(dashboardData, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error, error.stack);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    });
  }
}
