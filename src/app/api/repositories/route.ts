
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getUserRepositories, getGithubClient } from '@/lib/github'; // Added getGithubClient
import { Repository, User, connectMongoose } from '@/lib/mongodb'; // Added User
import type { Repository as RepoType } from '@/types';
import mongoose from 'mongoose';

const GITHUB_PAGES_TO_SYNC_ON_REQUEST = 10;
const GITHUB_REPOS_PER_PAGE = 30;

// Helper function to escape special characters for regex
function escapeRegExp(string: string) {
  if (!string) return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !mongoose.Types.ObjectId.isValid(session.user.id)) {
      return NextResponse.json({ error: 'Unauthorized or invalid user ID' }, { status: 401 });
    }

    await connectMongoose();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sync = searchParams.get('sync') === 'true';
    const searchTerm = searchParams.get('searchTerm');

    let query: any = { userId: session.user.id! };
    if (searchTerm && searchTerm.trim() !== "") {
      const safeSearchTerm = escapeRegExp(searchTerm.trim());
      const regex = new RegExp(safeSearchTerm, 'i');
      query.$or = [
        { fullName: regex },
        { name: regex },
        { language: regex }
      ];
    }

    let userMakingRequest = await User.findById(session.user.id).select('lastKnownTotalGitHubRepos lastGitHubRepoCountSync');

    if (sync) {
      console.log(`[API/Repositories] SYNC: User ${session.user.id}. Search: "${searchTerm || 'N/A'}". Will attempt to fetch up to ${GITHUB_PAGES_TO_SYNC_ON_REQUEST} pages from GitHub.`);

      let allFetchedGithubRepos: any[] = [];
      try {
        for (let i = 1; i <= GITHUB_PAGES_TO_SYNC_ON_REQUEST; i++) {
            const githubReposPage = await getUserRepositories(i, GITHUB_REPOS_PER_PAGE, true);
            allFetchedGithubRepos.push(...githubReposPage);
            if (githubReposPage.length < GITHUB_REPOS_PER_PAGE) {
              console.log(`[API/Repositories] SYNC: Reached end of GitHub repos on page ${i}.`);
              break;
            }
        }
      } catch (ghError: any) {
        console.error(`[API/Repositories] SYNC: Error fetching repositories from GitHub:`, ghError.message);
        // If sync fails, still proceed with current DB data but don't update GitHub total count.
        // Or, could return an error if this is critical. For now, log and continue.
        // No, if this part fails, we should probably indicate it.
        if (allFetchedGithubRepos.length === 0) { // If no repos fetched at all due to error
          throw new Error(`GitHub API error during sync: ${ghError.message}`);
        }
      }


      const uniqueGithubRepos = Array.from(new Map(allFetchedGithubRepos.map(repo => [repo.id, repo])).values());
      console.log(`[API/Repositories] SYNC: Fetched ${allFetchedGithubRepos.length} raw repos, ${uniqueGithubRepos.length} unique repos from GitHub.`);

      await Promise.all(
        uniqueGithubRepos.map(async (ghRepo) => {
          const repoData: Partial<RepoType> = {
            name: ghRepo.name,
            fullName: ghRepo.full_name,
            owner: ghRepo.owner.login,
            githubId: ghRepo.id,
            language: ghRepo.language || 'N/A',
            stars: ghRepo.stargazers_count || 0,
            isPrivate: ghRepo.private,
            userId: session.user.id!,
            updatedAt: new Date(ghRepo.updated_at),
          };
          try {
            await Repository.findOneAndUpdate(
              { githubId: ghRepo.id, userId: session.user.id! },
              { $set: repoData },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          } catch (upsertError) {
            console.error(`[API/Repositories] SYNC: Error upserting repo ${ghRepo.full_name}:`, upsertError);
          }
        })
      );
      
      let totalUserGitHubRepos: number | undefined = undefined;
      let lastGitHubRepoCountSyncTime: Date | undefined = undefined;
      try {
        const octokit = await getGithubClient(); // Uses session from getServerSession inside
        const { data: githubUser } = await octokit.rest.users.getAuthenticated();
        totalUserGitHubRepos = (githubUser.public_repos || 0) + (githubUser.total_private_repos || 0);
        lastGitHubRepoCountSyncTime = new Date();

        if (userMakingRequest) {
          userMakingRequest.lastKnownTotalGitHubRepos = totalUserGitHubRepos;
          userMakingRequest.lastGitHubRepoCountSync = lastGitHubRepoCountSyncTime;
          await userMakingRequest.save();
          console.log(`[API/Repositories] SYNC: Updated user ${session.user.id} with total GitHub repos: ${totalUserGitHubRepos}`);
        } else {
          console.warn(`[API/Repositories] SYNC: User document not found for ID ${session.user.id} to save GitHub repo count.`);
        }
      } catch (e: any) {
        console.error(`[API/Repositories] SYNC: Failed to get authenticated user's total repo count from GitHub: ${e.message}. Will use previous count if available.`);
        totalUserGitHubRepos = userMakingRequest?.lastKnownTotalGitHubRepos;
        lastGitHubRepoCountSyncTime = userMakingRequest?.lastGitHubRepoCountSync;
      }

      const refreshedLocalRepos = await Repository.find(query)
        .sort({ updatedAt: -1 })
        .skip(0)
        .limit(limit)
        .lean();
      const totalMatchingDbRepos = await Repository.countDocuments(query);

      console.log(`[API/Repositories] SYNC complete. Returning first page of ${totalMatchingDbRepos} (filtered by search: "${searchTerm || 'N/A'}") local repos for user ${session.user.id}.`);

      return NextResponse.json({
        repositories: refreshedLocalRepos,
        totalPages: Math.ceil(totalMatchingDbRepos / limit),
        currentPage: 1,
        totalMatchingDbRepos: totalMatchingDbRepos,
        totalUserGitHubRepos: totalUserGitHubRepos,
        lastGitHubRepoCountSync: lastGitHubRepoCountSyncTime,
      });

    } else {
      // Standard fetch without sync
      const skip = (page - 1) * limit;
      console.log(`[API/Repositories] DB FETCH: User ${session.user.id}, Page ${page}, Limit ${limit}, Search: "${searchTerm || 'N/A'}"`);
      
      const fetchedRepositories = await Repository.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      const totalMatchingDbRepos = await Repository.countDocuments(query);
      console.log(`[API/Repositories] DB FETCH complete. Returned ${fetchedRepositories.length} (filtered by search: "${searchTerm || 'N/A'}"). Total matching: ${totalMatchingDbRepos}`);
      
      return NextResponse.json({
        repositories: fetchedRepositories,
        totalPages: Math.ceil(totalMatchingDbRepos / limit),
        currentPage: page,
        totalMatchingDbRepos: totalMatchingDbRepos,
        totalUserGitHubRepos: userMakingRequest?.lastKnownTotalGitHubRepos,
        lastGitHubRepoCountSync: userMakingRequest?.lastGitHubRepoCountSync,
      });
    }

  } catch (error: any) {
    console.error('[API/Repositories GET] Error:', error.message, error.stack);
    if (error.message.includes('GitHub API error') || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: `GitHub API interaction failed: ${error.message}` }, { status: error.status || 500 });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
