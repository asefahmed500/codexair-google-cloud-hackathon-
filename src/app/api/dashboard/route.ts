import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, connectMongoose } from '@/lib/mongodb';
import type { DashboardData, RecentAnalysisItem, QualityTrendItem, DashboardOverview } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();
    const userId = session.user.id;

    // Find PullRequests associated with the user to filter analyses
    const userPullRequests = await PullRequest.find({ userId }).select('_id').lean();
    const userPullRequestIds = userPullRequests.map(pr => pr._id);

    if (userPullRequestIds.length === 0) {
        return NextResponse.json({
            overview: { totalAnalyses: 0, avgQualityScore: 0, securityIssuesCount: 0, trendsUp: false },
            recentAnalyses: [],
            qualityTrends: [],
        } as DashboardData);
    }

    // Aggregations based on user's analyses
    const totalAnalyses = await Analysis.countDocuments({ pullRequestId: { $in: userPullRequestIds } });

    const avgQualityScoreAgg = await Analysis.aggregate([
      { $match: { pullRequestId: { $in: userPullRequestIds } } },
      { $group: { _id: null, avgScore: { $avg: '$qualityScore' } } }
    ]).toArray();
    const avgQualityScore = avgQualityScoreAgg[0]?.avgScore || 0;

    const securityIssuesCountAgg = await Analysis.aggregate([
      { $match: { pullRequestId: { $in: userPullRequestIds } } },
      { $unwind: '$securityIssues' },
      { $match: { 'securityIssues.severity': { $in: ['critical', 'high'] } } }, // Count critical/high
      { $group: { _id: null, count: { $sum: 1 } } }
    ]).toArray();
    const securityIssuesCount = securityIssuesCountAgg[0]?.count || 0;

    const recentAnalysesDocs = await Analysis.find({ pullRequestId: { $in: userPullRequestIds } })
      .populate({ path: 'pullRequestId', select: 'title repositoryId number' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentAnalyses: RecentAnalysisItem[] = recentAnalysesDocs.map((analysis: any) => ({
      id: analysis._id.toString(),
      pullRequestTitle: analysis.pullRequestId?.title || 'N/A',
      // Extract repo name from repositoryId like "owner/repo-name"
      repositoryName: analysis.pullRequestId?.repositoryId?.substring(analysis.pullRequestId.repositoryId.indexOf('/') + 1) || 'N/A',
      prNumber: analysis.pullRequestId?.number,
      qualityScore: analysis.qualityScore,
      securityIssues: analysis.securityIssues?.length || 0,
      createdAt: analysis.createdAt,
    }));
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const qualityTrendsAgg = await Analysis.aggregate([
      { $match: { pullRequestId: { $in: userPullRequestIds }, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          avgQuality: { $avg: '$qualityScore' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } },
    ]).toArray();

    const qualityTrends: QualityTrendItem[] = qualityTrendsAgg.map((trend: any) => ({
      date: trend._id,
      quality: parseFloat(trend.avgQuality.toFixed(1)),
      count: trend.count,
    }));
    
    // Basic trend calculation (e.g., compare avg quality of last 7 days vs previous 7 days)
    // This is a simplified trend indicator
    let trendsUp = true;
    if (qualityTrends.length >= 2) {
        const lastScore = qualityTrends[qualityTrends.length -1].quality;
        const secondLastScore = qualityTrends[qualityTrends.length -2].quality;
        trendsUp = lastScore >= secondLastScore;
    } else if (qualityTrends.length === 1){
        trendsUp = qualityTrends[0].quality >= 7; // Arbitrary good score
    }


    const overview: DashboardOverview = {
      totalAnalyses,
      avgQualityScore: parseFloat(avgQualityScore.toFixed(1)),
      securityIssuesCount,
      trendsUp,
    };

    const dashboardData: DashboardData = {
      overview,
      recentAnalyses,
      qualityTrends,
    };

    return NextResponse.json(dashboardData);
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
