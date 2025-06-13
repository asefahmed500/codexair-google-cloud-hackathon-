
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
    const sync = searchParams.get('sync') === 'true'; // Optional sync flag

    if (sync) {
      // Fetch from GitHub and sync with MongoDB
      // This part remains user-specific: an admin syncing is syncing *for themselves*
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
      // When syncing, we typically return the newly synced/updated repos for that user.
      // To keep this consistent, we'll still query based on the user after sync.
      // The main "view all" logic is for non-sync GET requests.
       const userSyncedRepos = await Repository.find({ userId: session.user.id! })
        .sort({ updatedAt: -1 }) // Sort by most recently updated/synced
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const totalUserSyncedRepos = await Repository.countDocuments({ userId: session.user.id! });

      return NextResponse.json({
        repositories: userSyncedRepos,
        totalPages: Math.ceil(totalUserSyncedRepos / limit),
        currentPage: page,
      });

    } else {
      // Fetch from MongoDB only
      const skip = (page - 1) * limit;
      const query: any = {}; // Start with an empty query object

      if (session.user.role !== 'admin') { // If the user is NOT an admin, filter by their userId
        query.userId = session.user.id!;
      }
      // For admins, the query remains empty (if not explicitly filtering further), thus fetching all repositories.

      const fetchedRepositories = await Repository.find(query) // Use the conditional query
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(); 
      
      const totalRepos = await Repository.countDocuments(query); // Count based on the same query
      
      return NextResponse.json({ 
        repositories: fetchedRepositories,
        totalPages: Math.ceil(totalRepos / limit),
        currentPage: page,
      });
    }

  } catch (error: any) {
    console.error('Error in /api/repositories GET:', error);
    if (error.message.includes('GitHub API error') || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: `GitHub API interaction failed: ${error.message}` }, { status: error.status || 500 });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

