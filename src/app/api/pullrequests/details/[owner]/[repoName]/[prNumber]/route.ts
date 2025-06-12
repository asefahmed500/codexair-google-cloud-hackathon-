
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
        // If an admin tries to access a repo not synced by anyone, it's effectively not in our system.
        return NextResponse.json({ error: `Repository ${repoFullName} not found in the system.` }, { status: 404 });
      }
    } else {
      // Regular users can only access PRs from repositories associated with them
      localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
      if (!localRepo) {
          return NextResponse.json({ error: `Repository ${repoFullName} not found or not associated with the current user.` }, { status: 404 });
      }
    }

    // Build the query based on role
    const query: any = {
      repositoryId: localRepo._id.toString(),
      number: prNumber,
    };

    // Regular users can only access PRs linked to their userId
    if (session.user.role !== 'admin') {
      query.userId = session.user.id;
    }

    const pullRequest = await PullRequest.findOne(query)
      .populate('analysis') // Populate the analysis field
      .lean();

    if (!pullRequest) {
      return NextResponse.json({ error: 'Pull Request not found or access denied' }, { status: 404 });
    }
    
    // Ensure the populated analysis object (if it exists) is fully sent.
    // If analysis is just an ID, it means it wasn't populated or doesn't exist, which is fine.
    return NextResponse.json({ pullRequest });

  } catch (error: any) {
    console.error(`Error fetching PR details for ${params.owner}/${params.repoName}#${params.prNumber}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

