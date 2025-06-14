
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Account, connectMongoose } from '@/lib/mongodb'; // Ensure Account model is imported
import mongoose from 'mongoose';

interface LinkedAccountStatus {
  github: boolean;
  google: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!mongoose.Types.ObjectId.isValid(session.user.id)) {
        return NextResponse.json({ error: 'Invalid user ID format in session' }, { status: 400 });
    }
    const userId = new mongoose.Types.ObjectId(session.user.id);

    await connectMongoose();

    const linkedAccounts = await Account.find({ userId: userId }).select('provider').lean();

    const status: LinkedAccountStatus = {
      github: false,
      google: false,
    };

    linkedAccounts.forEach(account => {
      if (account.provider === 'github') {
        status.github = true;
      } else if (account.provider === 'google') {
        status.google = true;
      }
    });

    return NextResponse.json(status);

  } catch (error: any) {
    console.error('Error fetching linked accounts:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
