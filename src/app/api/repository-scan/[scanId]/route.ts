
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { RepositoryScan, connectMongoose } from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: { scanId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scanId } = params;
    if (!scanId || !mongoose.Types.ObjectId.isValid(scanId)) {
      return NextResponse.json({ error: 'Invalid Scan ID' }, { status: 400 });
    }

    await connectMongoose();

    // User can only fetch scans they initiated, unless they are admin
    const query: mongoose.FilterQuery<any> = { _id: scanId };
    if (session.user.role !== 'admin') {
      query.userId = session.user.id;
    }
    
    const scanResult = await RepositoryScan.findOne(query).lean();

    if (!scanResult) {
      return NextResponse.json({ error: 'Repository scan not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(scanResult);

  } catch (error: any) {
    console.error(`[API/RepoScan GET ${params.scanId}] Error:`, error);
    return NextResponse.json({ error: 'Failed to fetch repository scan results', details: error.message }, { status: 500 });
  }
}
