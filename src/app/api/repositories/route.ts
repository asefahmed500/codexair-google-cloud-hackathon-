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
      const githubRepos = await getUserRepositories(page, limit);

      const repos = await Promise.all(
        githubRepos.map(async (ghRepo) => {
          // Fetch full details to get correct language, stars, etc.
          // listForAuthenticatedUser might not have all details fresh.
          // However, to avoid too many API calls, we can use the list data first.
          // For this example, we use the list data directly.
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
      return NextResponse.json({ repositories: repos.filter(Boolean) });
    } else {
      // Fetch from MongoDB only
      const skip = (page - 1) * limit;
      const userRepos = await Repository.find({ userId: session.user.id! })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(); // Use .lean() for faster queries if not modifying docs
      
      const totalRepos = await Repository.countDocuments({ userId: session.user.id! });
      
      return NextResponse.json({ 
        repositories: userRepos,
        totalPages: Math.ceil(totalRepos / limit),
        currentPage: page,
      });
    }

  } catch (error: any) {
    console.error('Error in /api/repositories GET:', error);
    // Check if it's a GitHub API rate limit or auth error specifically
    if (error.message.includes('GitHub API error') || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: `GitHub API interaction failed: ${error.message}` }, { status: error.status || 500 });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
