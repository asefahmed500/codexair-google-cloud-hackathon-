
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User, Repository, Analysis, connectMongoose } from '@/lib/mongodb';

export interface AdminSummaryStats {
  totalUsers: number;
  totalRepositories: number;
  totalAnalyses: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const totalUsers = await User.countDocuments();
    const totalRepositories = await Repository.countDocuments(); // Counts all repository documents in the system
    const totalAnalyses = await Analysis.countDocuments();

    const stats: AdminSummaryStats = {
      totalUsers,
      totalRepositories,
      totalAnalyses,
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching admin summary stats:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
    