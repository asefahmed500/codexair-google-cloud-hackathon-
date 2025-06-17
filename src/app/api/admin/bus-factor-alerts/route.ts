
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PullRequest, connectMongoose } from '@/lib/mongodb';
import mongoose from 'mongoose';

const MIN_ANALYSES_FOR_BUS_FACTOR = 3; // Min analyzed PRs in a repo to consider for bus factor
const BUS_FACTOR_THRESHOLD = 0.7; // e.g., 0.7 for 70%

export interface BusFactorAlert {
  repoFullName: string;
  dominantAuthor: string;
  percentage: number;
  authorAnalysesCount: number;
  totalRepoAnalyses: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const aggregationPipeline: mongoose.PipelineStage[] = [
      // Stage 1: Filter for relevant PRs
      {
        $match: {
          analysisStatus: 'analyzed',
          analysis: { $exists: true, $ne: null },
          'author.login': { $exists: true, $ne: null },
          owner: { $exists: true, $ne: null },
          repoName: { $exists: true, $ne: null },
        },
      },
      // Stage 2: Group by repository and author to count analyses per author
      {
        $group: {
          _id: {
            owner: '$owner',
            repoName: '$repoName',
            authorLogin: '$author.login',
          },
          authorAnalysesCount: { $sum: 1 },
        },
      },
      // Stage 3: Group by repository to collect author stats and total analyses for the repo
      {
        $group: {
          _id: {
            owner: '$_id.owner',
            repoName: '$_id.repoName',
          },
          authors: {
            $push: {
              author: '$_id.authorLogin',
              count: '$authorAnalysesCount',
            },
          },
          totalRepoAnalyses: { $sum: '$authorAnalysesCount' },
        },
      },
      // Stage 4: Filter out repos with too few analyses to be meaningful
      {
        $match: {
          totalRepoAnalyses: { $gte: MIN_ANALYSES_FOR_BUS_FACTOR },
        },
      },
      // Stage 5: Calculate percentage for each author and find dominant ones
      {
        $addFields: {
          repoFullName: { $concat: ['$_id.owner', '/', '$_id.repoName'] },
          dominantAuthorsInfo: {
            $filter: {
              input: '$authors',
              as: 'auth',
              cond: {
                $gt: [
                  { $divide: ['$$auth.count', '$totalRepoAnalyses'] },
                  BUS_FACTOR_THRESHOLD,
                ],
              },
            },
          },
        },
      },
      // Stage 6: Filter for repos that actually have a dominant author meeting the threshold
      {
        $match: {
          dominantAuthorsInfo: { $ne: [] },
        },
      },
      // Stage 7: Unwind if multiple authors could theoretically exceed threshold (though unlikely for >70%)
      {
        $unwind: '$dominantAuthorsInfo',
      },
      // Stage 8: Project the final shape
      {
        $project: {
          _id: 0,
          repoFullName: '$repoFullName',
          dominantAuthor: '$dominantAuthorsInfo.author',
          percentage: {
            $multiply: [
              { $divide: ['$dominantAuthorsInfo.count', '$totalRepoAnalyses'] },
              100,
            ],
          },
          authorAnalysesCount: '$dominantAuthorsInfo.count',
          totalRepoAnalyses: '$totalRepoAnalyses',
        },
      },
      // Stage 9: Sort by the highest percentage
      {
        $sort: {
          percentage: -1,
        },
      },
      // Stage 10: Limit results (optional, but good for performance)
      {
        $limit: 20, // Limit to top 20 potential bus factor risks
      }
    ];

    const alerts: BusFactorAlert[] = await PullRequest.aggregate(aggregationPipeline).exec();

    const formattedAlerts = alerts.map(alert => ({
        ...alert,
        percentage: parseFloat(alert.percentage.toFixed(1)) // Ensure percentage is a clean number
    }));

    return NextResponse.json({ alerts: formattedAlerts });

  } catch (error: any) {
    console.error('[API/admin/bus-factor-alerts] Error calculating bus factor alerts:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

