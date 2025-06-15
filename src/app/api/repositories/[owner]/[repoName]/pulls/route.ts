
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PullRequest as LocalPullRequest, Repository, connectMongoose } from '@/lib/mongodb';
import type { PullRequest as PRType } from '@/types';

// This route is intended to fetch PRs already synced/created in the local DB.
export async function GET(
  request: NextRequest,
  context: { params: { owner: string; repoName: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const owner = context.params.owner;
    const repoName = context.params.repoName;

    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Missing owner or repository name' }, { status: 400 });
    }
    
    const repoFullName = `${owner}/${repoName}`;

    // Find the local repository to ensure it's tracked by the user
    const localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not associated with user or not found.` }, { status: 404 });
    }

    // Fetch PRs from local DB associated with this repository
    const pullRequestsFromDB = await LocalPullRequest.find({ repositoryId: localRepo._id.toString() })
      .sort({ number: -1 }) // Sort by PR number descending or by update date
      .populate('analysis', '_id qualityScore') // Populate relevant fields from analysis
      .lean();
    
    // Augment with analysis status
    const augmentedPRs = pullRequestsFromDB.map((pr: any) => ({
      ...pr, // Spread all fields from DB PR
      id: pr.githubId, // Use githubId as 'id' for consistency if needed by frontend
      user: pr.author, // Map author to user field if needed
      html_url: `https://github.com/${repoFullName}/pull/${pr.number}`, // Construct GitHub URL
      created_at: pr.createdAt, // Map DB timestamp
      updated_at: pr.updatedAt, // Map DB timestamp
      analysisStatus: pr.analysis ? 'analyzed' : 'not_started',
      analysisId: pr.analysis?._id?.toString() || (typeof pr.analysis === 'string' ? pr.analysis : undefined),
      qualityScore: pr.analysis?.qualityScore, // if populated
    }));

    return NextResponse.json({ pullRequests: augmentedPRs });

  } catch (error: any) {
    console.error(`Error fetching local DB pull requests for ${context.params.owner}/${context.params.repoName}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
