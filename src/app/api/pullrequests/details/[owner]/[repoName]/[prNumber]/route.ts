
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PullRequest, Repository, connectMongoose } from '@/lib/mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repoName: string; prNumber: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { owner, repoName, prNumber: prNumberStr } = params;
    const prNumber = parseInt(prNumberStr);

    if (!owner || !repoName || isNaN(prNumber)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }
    
    const repoFullName = `${owner}/${repoName}`;
    let localRepo;

    // Admins can access PRs from any repository that's been synced by any user
    if (session.user.role === 'admin') {
      localRepo = await Repository.findOne({ fullName: repoFullName });
      if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not found in the system.` }, { status: 404 });
      }
    } else {
      localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
      if (!localRepo) {
          return NextResponse.json({ error: `Repository ${repoFullName} not found or not associated with the current user.` }, { status: 404 });
      }
    }

    const query: any = {
      repositoryId: localRepo._id.toString(),
      number: prNumber,
    };


    const pullRequest = await PullRequest.findOne(query)
      .populate('analysis') 
      .lean();

    if (!pullRequest) {
      // Attempt to fetch from GitHub if not found locally - this might be desired for comparison if one PR isn't in DB yet
      // For now, this API strictly fetches from local DB. If we want to fetch from GH as fallback, that's a separate logic.
      return NextResponse.json({ error: 'Pull Request not found in local database or access denied' }, { status: 404 });
    }
    
    return NextResponse.json({ pullRequest });

  } catch (error: any) {
    console.error(`Error fetching PR details for ${params.owner}/${params.repoName}#${params.prNumber}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}



