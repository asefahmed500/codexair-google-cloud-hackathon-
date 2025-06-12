
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, connectMongoose } from '@/lib/mongodb';
import type { DashboardData, RecentAnalysisItem, QualityTrendItem, DashboardOverview, TopIssueItem, SecurityIssue, Suggestion, SecurityHotspotItem, TeamMemberMetric, FileAnalysisItem } from '@/types';

const MAX_TOP_ISSUES = 5;
const MAX_HOTSPOTS = 5;
const MAX_TEAM_MEMBERS = 10;

function getTopItems(
  analyses: any[],
  itemSelector: (analysis: any) => (SecurityIssue[] | Suggestion[]),
  titleExtractor: (item: SecurityIssue | Suggestion) => string,
  severityExtractor?: (item: SecurityIssue) => SecurityIssue['severity'],
  priorityExtractor?: (item: Suggestion) => Suggestion['priority'],
  typeExtractor?: (item: SecurityIssue | Suggestion) => SecurityIssue['type'] | Suggestion['type']
): TopIssueItem[] {
  const itemCounts: Record<string, TopIssueItem> = {};

  analyses.forEach(analysis => {
    const items = itemSelector(analysis) || [];
    items.forEach((item: SecurityIssue | Suggestion) => {
      const title = titleExtractor(item);
      if (!itemCounts[title]) {
        itemCounts[title] = { title, count: 0 };
        if (severityExtractor && 'severity' in item) itemCounts[title].severity = severityExtractor(item as SecurityIssue);
        if (priorityExtractor && 'priority' in item) itemCounts[title].priority = priorityExtractor(item as Suggestion);
        if (typeExtractor) itemCounts[title].type = typeExtractor(item);
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

    const userPullRequests = await PullRequest.find({ userId }).select('_id author').lean(); // Select author for team metrics
    const userPullRequestIds = userPullRequests.map(pr => pr._id);

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

    // Fetch all analyses for the user to calculate various metrics
    const allUserAnalyses = await Analysis.find({ pullRequestId: { $in: userPullRequestIds } })
      .populate({
        path: 'pullRequestId',
        select: 'title repositoryId number author', // Ensure author is selected for team metrics
        populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' }
      })
      .lean();


    const totalAnalyses = allUserAnalyses.length;

    const avgQualityScore = totalAnalyses > 0
      ? allUserAnalyses.reduce((sum, a) => sum + (a.qualityScore || 0), 0) / totalAnalyses
      : 0;

    const securityIssuesCount = allUserAnalyses.reduce((sum, a) => {
        const criticalHigh = (a.securityIssues || []).filter(si => si.severity === 'critical' || si.severity === 'high');
        return sum + criticalHigh.length;
    }, 0);


    const recentAnalysesDocs = allUserAnalyses
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    const recentAnalyses: RecentAnalysisItem[] = recentAnalysesDocs.map((analysis: any) => {
      let repoNameDisplay = 'N/A';
      if (analysis.pullRequestId?.repositoryId) {
        if (typeof analysis.pullRequestId.repositoryId === 'string') {
            repoNameDisplay = analysis.pullRequestId.repositoryId;
        }
        else if (typeof analysis.pullRequestId.repositoryId === 'object' && analysis.pullRequestId.repositoryId.fullName) {
            repoNameDisplay = analysis.pullRequestId.repositoryId.fullName;
        }
      }

      return {
        id: analysis._id.toString(),
        pullRequestTitle: analysis.pullRequestId?.title || 'N/A',
        repositoryName: repoNameDisplay,
        prNumber: analysis.pullRequestId?.number,
        qualityScore: analysis.qualityScore || 0,
        securityIssues: (analysis.securityIssues || []).filter((si: SecurityIssue) => si.severity === 'critical' || si.severity === 'high').length,
        createdAt: analysis.createdAt,
      };
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const qualityTrendsData = allUserAnalyses.filter(a => new Date(a.createdAt) >= thirtyDaysAgo);
    const qualityTrendsAggMap: Record<string, { totalQuality: number, count: number }> = {};

    qualityTrendsData.forEach((analysis: any) => {
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
      allUserAnalyses,
      a => a.securityIssues,
      item => item.title,
      item => item.severity,
      undefined,
      item => item.type
    );

    const topSuggestions = getTopItems(
      allUserAnalyses,
      a => a.suggestions,
      item => item.title,
      undefined,
      item => item.priority,
      item => item.type
    );

    // Calculate Security Hotspots
    const fileIssueCounts: Record<string, SecurityHotspotItem> = {};
    allUserAnalyses.forEach((analysis: any) => {
      (analysis.fileAnalyses || []).forEach((file: FileAnalysisItem) => {
        if (!file.filename) return;
        if (!fileIssueCounts[file.filename]) {
          fileIssueCounts[file.filename] = {
            filename: file.filename,
            criticalIssues: 0,
            highIssues: 0,
            totalIssuesInFile: 0,
            relatedPrIds: [],
            lastOccurrence: new Date(0), // Initialize with a very old date
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

    // Calculate Team Metrics
    const memberMetrics: Record<string, TeamMemberMetric> = {};
    allUserAnalyses.forEach((analysis: any) => {
        const authorLogin = analysis.pullRequestId?.author?.login;
        if (!authorLogin) return;

        if (!memberMetrics[authorLogin]) {
            memberMetrics[authorLogin] = {
                userId: authorLogin, // Using login as ID, ideally map to a User._id if available
                userName: authorLogin,
                userAvatar: analysis.pullRequestId?.author?.avatar,
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
    .sort((a,b) => b.totalAnalyses - a.totalAnalyses || b.avgQualityScore - a.avgQualityScore) // Example sort
    .slice(0, MAX_TEAM_MEMBERS);


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

