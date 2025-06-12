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

    // Find the local repository to link the PR
    const localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not found or not associated with user.` }, { status: 404 });
    }

    const pullRequest = await PullRequest.findOne({
      repositoryId: localRepo._id.toString(),
      number: prNumber,
      userId: session.user.id, // Ensure the PR belongs to the current user
    }).populate('analysis').lean();

    if (!pullRequest) {
      return NextResponse.json({ error: 'Pull Request not found or access denied' }, { status: 404 });
    }
    
    return NextResponse.json({ pullRequest });

  } catch (error: any) {
    console.error(`Error fetching PR details for ${params.owner}/${params.repoName}#${params.prNumber}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
