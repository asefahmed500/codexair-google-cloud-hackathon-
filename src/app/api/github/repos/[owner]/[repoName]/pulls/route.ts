
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

    const localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not associated with user or not found.` }, { status: 404 });
    }

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
      // Note: 'pending' and 'failed' statuses would typically be set by the analysis background job/process
      // For this API, we primarily know if an analysis record exists ('analyzed') or not ('not_started').

      return {
        id: ghPR.id, 
        number: ghPR.number,
        title: ghPR.title,
        body: ghPR.body,
        state: ghPR.state, 
        html_url: ghPR.html_url,
        created_at: ghPR.created_at,
        updated_at: ghPR.updated_at,
        user: { 
            login: ghPR.user?.login || 'unknown',
            avatar_url: ghPR.user?.avatar_url || ''
        },
        _id: localMatch?._id?.toString(), 
        author: localMatch?.author || { login: ghPR.user?.login || 'unknown', avatar: ghPR.user?.avatar_url || '' }, 
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

// This local DB fetch function might be used if you want to list PRs that are ONLY in your DB
// (e.g., including closed ones for which you have analysis), separate from live GitHub state.
// For the main PR listing, the above GET that merges with live GitHub data is preferred.
export async function _getLocalPullRequests( 
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
      .populate('analysis', '_id qualityScore') 
      .lean();
    
    const augmentedPRs = pullRequests.map(pr => ({
      ...pr,
      analysisStatus: pr.analysis ? 'analyzed' : 'not_started',
      analysisId: pr.analysis?._id?.toString() || (typeof pr.analysis === 'string' ? pr.analysis : undefined),
      qualityScore: (pr.analysis as any)?.qualityScore, // if populated
    }));

    return NextResponse.json({ pullRequests: augmentedPRs });
  } catch (error: any) {
    console.error(`Error fetching DB PRs for ${params.owner}/${params.repoName}:`, error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
