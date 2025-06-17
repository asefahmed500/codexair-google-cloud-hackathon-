
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPullRequests as getGitHubPullRequests } from '@/lib/github';
import { PullRequest as LocalPullRequest, Repository, connectMongoose } from '@/lib/mongodb';
import type { PullRequest as PRType } from '@/types';

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

    let localRepoQuery: any = { fullName: repoFullName };
    if (session.user.role !== 'admin') {
      localRepoQuery.userId = session.user.id;
    }
    
    const localRepo = await Repository.findOne(localRepoQuery);
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not associated with user or not found in system.` }, { status: 404 });
    }

    // Fetch ALL pull requests (open, closed, merged)
    const githubPRs = await getGitHubPullRequests(owner, repoName, 'all'); 

    const prNumbersFromGithub = githubPRs.map(pr => pr.number);

    // Fetch local PR data for these PR numbers to get analysis status
    const localPRs = await LocalPullRequest.find({
      repositoryId: localRepo._id.toString(),
      number: { $in: prNumbersFromGithub },
    }).populate('analysis', '_id qualityScore').lean(); 

    const mergedPRs = githubPRs.map(ghPR => {
      const localMatch = localPRs.find(localDbPr => localDbPr.number === ghPR.number);
      
      let analysisStatus: 'analyzed' | 'pending' | 'failed' | 'not_started' = 'not_started';
      if (localMatch?.analysisStatus) { 
        analysisStatus = localMatch.analysisStatus;
      } else if (localMatch?.analysis) {
        analysisStatus = 'analyzed';
      }

      let currentPRState: "open" | "closed" | "merged" = ghPR.state as "open" | "closed";
      if (ghPR.state === 'closed' && ghPR.merged_at) {
        currentPRState = 'merged';
      }
      
      return {
        id: ghPR.id, 
        _id: localMatch?._id?.toString(), 
        number: ghPR.number,
        title: ghPR.title,
        body: ghPR.body,
        state: currentPRState, 
        html_url: ghPR.html_url,
        created_at: ghPR.created_at,
        updated_at: ghPR.updated_at,
        user: { 
            login: ghPR.user?.login || 'unknown',
            avatar_url: ghPR.user?.avatar_url || ''
        },
        author: localMatch?.author || { login: ghPR.user?.login || 'unknown', avatar: ghPR.user?.avatar_url || '' },
        branch: ghPR.head?.ref, // branch name is in head.ref
        analysisStatus: analysisStatus,
        analysisId: localMatch?.analysis?._id?.toString() || (typeof localMatch?.analysis === 'string' ? localMatch.analysis : undefined),
        qualityScore: (localMatch?.analysis as any)?.qualityScore, 
      };
    });

    return NextResponse.json({ pull_requests: mergedPRs.sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) });

  } catch (error: any) {
    console.error(`Error fetching pull requests for ${context.params.owner}/${context.params.repoName}:`, error);
    if (error.message.includes('GitHub API error') || error.status === 401 || error.status === 403 || error.status === 404) {
        return NextResponse.json({ error: `GitHub interaction failed: ${error.message}` }, { status: error.status || 500 });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
