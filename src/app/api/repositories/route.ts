
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getUserRepositories, getRepositoryDetails } from '@/lib/github';
import { Repository, connectMongoose } from '@/lib/mongodb';
import type { Repository as RepoType } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sync = searchParams.get('sync') === 'true';

    if (sync) {
      // Fetch from GitHub and sync with MongoDB for the current user
      console.log(`[API/Repositories] Syncing GitHub repositories for user: ${session.user.id}, page: ${page}, limit: ${limit}`);
      const githubRepos = await getUserRepositories(page, limit);

      const repos = await Promise.all(
        githubRepos.map(async (ghRepo) => {
          const repoData: Partial<RepoType> = {
            name: ghRepo.name,
            fullName: ghRepo.full_name,
            owner: ghRepo.owner.login,
            githubId: ghRepo.id,
            language: ghRepo.language || 'N/A',
            stars: ghRepo.stargazers_count || 0,
            isPrivate: ghRepo.private,
            userId: session.user.id!, 
          };

          return Repository.findOneAndUpdate(
            { githubId: ghRepo.id, userId: session.user.id! }, 
            { $set: repoData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        })
      );
      
      // After syncing, return the current page of repositories for THIS USER from DB
      const userSyncedReposQuery = { userId: session.user.id! };
      const userSyncedRepos = await Repository.find(userSyncedReposQuery)
        .sort({ updatedAt: -1 }) 
        .skip((page - 1) * limit) // Pagination should apply to the DB query result
        .limit(limit)
        .lean();
      const totalUserSyncedRepos = await Repository.countDocuments(userSyncedReposQuery);
      
      console.log(`[API/Repositories] Sync complete. Found ${githubRepos.length} from GitHub API. Returning ${userSyncedRepos.length} for user from DB page ${page}. Total synced for user: ${totalUserSyncedRepos}`);

      return NextResponse.json({
        repositories: userSyncedRepos,
        totalPages: Math.ceil(totalUserSyncedRepos / limit),
        currentPage: page,
      });

    } else {
      // Fetch from MongoDB only, for the current user
      const skip = (page - 1) * limit;
      // Always filter by the current session user's ID for this endpoint
      const query = { userId: session.user.id! }; 
      
      console.log(`[API/Repositories] Fetching from DB for user: ${session.user.id}, page: ${page}, limit: ${limit}`);
      const fetchedRepositories = await Repository.find(query) 
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(); 
      
      const totalRepos = await Repository.countDocuments(query); 
      console.log(`[API/Repositories] DB fetch complete. Returning ${fetchedRepositories.length} for user. Total for user: ${totalRepos}`);
      
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
