
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, connectMongoose } from '@/lib/mongodb';
import type { DashboardData, RecentAnalysisItem, QualityTrendItem, DashboardOverview, TopIssueItem, SecurityIssue, Suggestion } from '@/types';

const MAX_TOP_ISSUES = 5;

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

    const userPullRequests = await PullRequest.find({ userId }).select('_id').lean();
    const userPullRequestIds = userPullRequests.map(pr => pr._id);

    if (userPullRequestIds.length === 0) {
        return NextResponse.json({
            overview: { totalAnalyses: 0, avgQualityScore: 0, securityIssuesCount: 0, trendsUp: false },
            recentAnalyses: [],
            qualityTrends: [],
            topSecurityIssues: [],
            topSuggestions: [],
        } as DashboardData);
    }
    
    // Fetch all analyses for the user to calculate top issues, then filter for recent/trends
    const allUserAnalyses = await Analysis.find({ pullRequestId: { $in: userPullRequestIds } })
      .populate({ 
        path: 'pullRequestId', 
        select: 'title repositoryId number',
        populate: { path: 'repositoryId', model: 'Repository', select: 'name fullName owner' } // Assuming repositoryId in PR is actual ID
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
        // If repositoryId is a string like 'owner/repo-name'
        if (typeof analysis.pullRequestId.repositoryId === 'string') {
            repoNameDisplay = analysis.pullRequestId.repositoryId;
        } 
        // If repositoryId is an object (populated from a ref to Repository collection)
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
        securityIssues: analysis.securityIssues?.length || 0,
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
      undefined, // no priority for security issues
      item => item.type
    );

    const topSuggestions = getTopItems(
      allUserAnalyses,
      a => a.suggestions,
      item => item.title,
      undefined, // no severity for suggestions
      item => item.priority,
      item => item.type
    );

    const dashboardData: DashboardData = {
      overview,
      recentAnalyses,
      qualityTrends,
      topSecurityIssues,
      topSuggestions,
    };

    return NextResponse.json(dashboardData);
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error, error.stack);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
