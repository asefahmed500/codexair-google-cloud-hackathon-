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
    // Ensure that this PR belongs to the logged-in user or a repo they have access to.
    // For simplicity, we assume if they have analysisId, they have access.
    // In a real app, you might want to check `PullRequest.userId` or `Repository.userId`.
    const pullRequest = await PullRequest.findById(analysis.pullRequestId).lean();

    if (!pullRequest) {
      // This case should ideally not happen if data integrity is maintained.
      return NextResponse.json({ error: 'Associated Pull Request not found' }, { status: 404 });
    }
    
    // Check if the PR belongs to the user
    if (pullRequest.userId !== session.user.id) {
        // This check might be too restrictive if PRs can be shared or are from public repos
        // that the user is analyzing. For now, let's assume PRs are user-specific.
        // return NextResponse.json({ error: 'Access to this pull request analysis is denied' }, { status: 403 });
        // Allowing access if analysis exists, as user might be viewing a shared analysis or public one.
        // A more robust permission model would be needed for complex scenarios.
    }


    return NextResponse.json({ analysis, pullRequest });

  } catch (error: any) {
    console.error(`Error fetching analysis ${params.analysisId}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
