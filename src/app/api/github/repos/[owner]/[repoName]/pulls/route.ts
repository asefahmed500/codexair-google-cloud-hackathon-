
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPullRequests as getGitHubPullRequests } from '@/lib/github';
import { PullRequest as LocalPullRequest, Repository, connectMongoose } from '@/lib/mongodb';
import type { PullRequest as PRType } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repoName: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { owner, repoName } = params;
    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Missing owner or repository name' }, { status: 400 });
    }
    
    const repoFullName = `${owner}/${repoName}`;

    // Find the local repository to ensure it's tracked by the user
    const localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not associated with user or not found.` }, { status: 404 });
    }


    // Fetch PRs from GitHub
    const githubPRs = await getGitHubPullRequests(owner, repoName, 'open', 1, 50); // Fetch open PRs, up to 50

    // Fetch corresponding PRs from local DB to check analysis status
    const prNumbersFromGithub = githubPRs.map(pr => pr.number);
    const localPRs = await LocalPullRequest.find({
      repositoryId: localRepo._id.toString(),
      number: { $in: prNumbersFromGithub },
    }).populate('analysis', '_id qualityScore').lean(); // Only populate necessary fields

    // Merge GitHub PR data with local analysis status
    const mergedPRs = githubPRs.map(ghPR => {
      const localMatch = localPRs.find(localDbPr => localDbPr.number === ghPR.number);
      return {
        // GitHub PR data
        id: ghPR.id, // GitHub's global PR ID (distinct from our _id)
        number: ghPR.number,
        title: ghPR.title,
        body: ghPR.body,
        state: ghPR.state, // 'open', 'closed', etc.
        html_url: ghPR.html_url,
        created_at: ghPR.created_at,
        updated_at: ghPR.updated_at,
        user: { // Standardize user object
            login: ghPR.user?.login || 'unknown',
            avatar_url: ghPR.user?.avatar_url || ''
        },
        // Local DB info merged in
        _id: localMatch?._id?.toString(), // Our local database document ID for this PR
        author: localMatch?.author || { login: ghPR.user?.login || 'unknown', avatar: ghPR.user?.avatar_url || '' }, // ensure author from local if available
        analysisStatus: localMatch?.analysis ? 'analyzed' : 'not_started',
        analysisId: localMatch?.analysis?._id?.toString() || (typeof localMatch?.analysis === 'string' ? localMatch.analysis : undefined),
        qualityScore: (localMatch?.analysis as any)?.qualityScore, // if populated
      };
    });

    return NextResponse.json({ pull_requests: mergedPRs });

  } catch (error: any) {
    console.error(`Error fetching pull requests for ${params.owner}/${params.repoName}:`, error);
    if (error.message.includes('GitHub API error') || error.status === 401 || error.status === 403 || error.status === 404) {
        return NextResponse.json({ error: `GitHub interaction failed: ${error.message}` }, { status: error.status || 500 });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

// Placeholder for fetching PRs from DB only (used by analyze/[owner]/[repoName]/page.tsx)
export async function _getLocalPullRequests( // Renamed to avoid conflict if ever exported directly via route
  request: NextRequest,
  { params }: { params: { owner: string; repoName: string } }
) {
  try {
    const session = await getServerSession(authOptions);
     if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await connectMongoose();
    const { owner, repoName } = params;
    const repoFullName = `${owner}/${repoName}`;
    
    const localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not associated with user or not found.` }, { status: 404 });
    }

    const pullRequests = await LocalPullRequest.find({ repositoryId: localRepo._id.toString() })
      .sort({ number: -1 })
      .populate('analysis', '_id') // Only populate analysis ID to check existence
      .lean();
    
    const augmentedPRs = pullRequests.map(pr => ({
      ...pr,
      analysisStatus: pr.analysis ? 'analyzed' : 'not_started',
      analysisId: pr.analysis?._id?.toString() || (typeof pr.analysis === 'string' ? pr.analysis : undefined),
    }));

    return NextResponse.json({ pullRequests: augmentedPRs });
  } catch (error: any) {
    console.error(`Error fetching DB PRs for ${params.owner}/${params.repoName}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
