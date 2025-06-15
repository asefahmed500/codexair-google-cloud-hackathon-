
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getUserRepositories, getRepositoryDetails } from '@/lib/github';
import { Repository, connectMongoose } from '@/lib/mongodb';
import type { Repository as RepoType } from '@/types';

const GITHUB_PAGES_TO_SYNC_ON_REQUEST = 3; // Number of pages to fetch from GitHub during a manual sync
const GITHUB_REPOS_PER_PAGE = 30; // Default per_page for GitHub API, match this in getUserRepositories if configurable

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10'); // This limit applies to the response from THIS API
    const sync = searchParams.get('sync') === 'true';

    if (sync) {
      console.log(`[API/Repositories] SYNC: User ${session.user.id}. Will attempt to fetch up to ${GITHUB_PAGES_TO_SYNC_ON_REQUEST} pages from GitHub.`);
      
      let allFetchedGithubRepos: any[] = [];
      for (let i = 1; i <= GITHUB_PAGES_TO_SYNC_ON_REQUEST; i++) {
        try {
          const githubReposPage = await getUserRepositories(i, GITHUB_REPOS_PER_PAGE);
          allFetchedGithubRepos.push(...githubReposPage);
          if (githubReposPage.length < GITHUB_REPOS_PER_PAGE) {
            console.log(`[API/Repositories] SYNC: Reached end of GitHub repos on page ${i}.`);
            break; // No more repos on GitHub
          }
        } catch (ghError: any) {
          console.error(`[API/Repositories] SYNC: Error fetching page ${i} from GitHub:`, ghError.message);
          // If one page fails, we can decide to stop or continue with what we have.
          // For now, let's stop and report an issue if the first page fails, otherwise continue.
          if (i === 1) throw ghError; // Re-throw if first page fails.
          break; 
        }
      }

      // Deduplicate based on githubId before upserting
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
            updatedAt: new Date(ghRepo.updated_at), // Use GitHub's updated_at for sorting consistency
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
      
      // After syncing, return the *first page* of the user's *locally stored* repositories
      const userSyncedReposQuery = { userId: session.user.id! };
      const refreshedLocalRepos = await Repository.find(userSyncedReposQuery)
        .sort({ updatedAt: -1 }) // Sort by the updatedAt from GitHub
        .skip(0) // Always return first page of local DB after sync
        .limit(limit) // Use the original limit for the response
        .lean();
      const totalUserSyncedRepos = await Repository.countDocuments(userSyncedReposQuery);
      
      console.log(`[API/Repositories] SYNC complete. Returning first page of ${totalUserSyncedRepos} local repos for user ${session.user.id}.`);

      return NextResponse.json({
        repositories: refreshedLocalRepos,
        totalPages: Math.ceil(totalUserSyncedRepos / limit),
        currentPage: 1, // Always return page 1 of local DB after sync
      });

    } else {
      // Standard fetch from local DB (paginated)
      const skip = (page - 1) * limit;
      const query = { userId: session.user.id! }; 
      
      console.log(`[API/Repositories] DB FETCH: User ${session.user.id}, Page ${page}, Limit ${limit}`);
      const fetchedRepositories = await Repository.find(query) 
        .sort({ updatedAt: -1 }) // Sort by the updatedAt from GitHub
        .skip(skip)
        .limit(limit)
        .lean(); 
      
      const totalRepos = await Repository.countDocuments(query); 
      console.log(`[API/Repositories] DB FETCH complete. Returned ${fetchedRepositories.length}. Total for user: ${totalRepos}`);
      
      return NextResponse.json({ 
        repositories: fetchedRepositories,
        totalPages: Math.ceil(totalRepos / limit),
        currentPage: page,
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
