
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

    // Ensure the user has this repository synced/connected in our system
    // For admins, this check might be different or skipped if they should see all system PRs.
    // For now, assuming non-admins can only see PRs of repos they've synced.
    let localRepoQuery: any = { fullName: repoFullName };
    if (session.user.role !== 'admin') {
      localRepoQuery.userId = session.user.id;
    }
    
    const localRepo = await Repository.findOne(localRepoQuery);
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not associated with user or not found in system.` }, { status: 404 });
    }

    // Fetch open PRs from GitHub by default. Could be made configurable via query params.
    const githubPRs = await getGitHubPullRequests(owner, repoName, 'open', 1, 50); 

    const prNumbersFromGithub = githubPRs.map(pr => pr.number);
    const localPRs = await LocalPullRequest.find({
      repositoryId: localRepo._id.toString(),
      number: { $in: prNumbersFromGithub },
    }).populate('analysis', '_id qualityScore').lean(); 

    const mergedPRs = githubPRs.map(ghPR => {
      const localMatch = localPRs.find(localDbPr => localDbPr.number === ghPR.number);
      
      let analysisStatus: 'analyzed' | 'pending' | 'failed' | 'not_started' = 'not_started';
      if (localMatch?.analysis) {
        analysisStatus = 'analyzed';
      }
      // "pending" and "failed" statuses are typically client-side optimistic updates or from a background job system.
      // For this API, we primarily know if an analysis record exists ('analyzed') or not ('not_started').

      return {
        id: ghPR.id, 
        number: ghPR.number,
        title: ghPR.title,
        body: ghPR.body,
        state: ghPR.state as "open" | "closed" | "merged", 
        html_url: ghPR.html_url,
        created_at: ghPR.created_at,
        updated_at: ghPR.updated_at,
        user: { 
            login: ghPR.user?.login || 'unknown',
            avatar_url: ghPR.user?.avatar_url || ''
        },
        branch: ghPR.head?.ref, // Branch name from head.ref
        // Local DB derived data
        _id: localMatch?._id?.toString(), // Our DB's PullRequest document _id
        author: localMatch?.author || { login: ghPR.user?.login || 'unknown', avatar: ghPR.user?.avatar_url || '' }, // Prefer local DB stored author if available
        analysisStatus: analysisStatus,
        analysisId: localMatch?.analysis?._id?.toString() || (typeof localMatch?.analysis === 'string' ? localMatch.analysis : undefined),
        qualityScore: (localMatch?.analysis as any)?.qualityScore, 
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
