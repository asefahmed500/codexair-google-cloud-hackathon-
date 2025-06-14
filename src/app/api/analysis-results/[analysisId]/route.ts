
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, PullRequest, connectMongoose } from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { analysisId } = params;
    if (!analysisId || !mongoose.Types.ObjectId.isValid(analysisId)) {
      return NextResponse.json({ error: 'Invalid Analysis ID' }, { status: 400 });
    }

    const analysis = await Analysis.findById(analysisId).lean();

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // Find the associated PullRequest
    const pullRequest = await PullRequest.findById(analysis.pullRequestId).lean();

    if (!pullRequest) {
      // This case should ideally not happen if data integrity is maintained.
      return NextResponse.json({ error: 'Associated Pull Request not found' }, { status: 404 });
    }
    
    // Check if the user has permission to view this analysis
    // Admins can view any analysis.
    // Regular users can only view analyses for PRs linked to their userId (or PRs in repos they own/collaborate if that's the logic).
    // Assuming PRs are linked to a userId at creation time (e.g., user who initiated sync/analysis of that repo's PRs)
    if (session.user.role !== 'admin' && pullRequest.userId !== session.user.id) {
        // Further check: if PR.userId is not set, but analysis is for a repo the user synced, allow.
        // This might require fetching the Repository document linked to the PullRequest.
        // For simplicity now, strictly checking pullRequest.userId against session.user.id for non-admins.
        // This implies that pullRequest.userId must be correctly set when the PR is first created/synced in our DB.
        return NextResponse.json({ error: 'Access to this pull request analysis is denied' }, { status: 403 });
    }


    return NextResponse.json({ analysis, pullRequest });

  } catch (error: any) {
    console.error(`Error fetching analysis ${params.analysisId}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

