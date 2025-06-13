
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { AuditLog, connectMongoose } from '@/lib/mongodb';
import type { AuditLogEntry } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20'); // Default to 20 logs per page
    const skip = (page - 1) * limit;

    const auditLogsFromDb = await AuditLog.find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      // .populate('adminUserId', 'name email') // Optional: to get admin user details
      // .populate('targetUserId', 'name email') // Optional: to get target user details
      .lean();

    const totalLogs = await AuditLog.countDocuments();

    const auditLogs: AuditLogEntry[] = auditLogsFromDb.map((log: any) => ({
      _id: log._id.toString(),
      timestamp: log.timestamp,
      adminUserId: log.adminUserId?.toString(),
      adminUserEmail: log.adminUserEmail,
      action: log.action,
      targetUserId: log.targetUserId?.toString(),
      targetUserEmail: log.targetUserEmail,
      details: log.details,
    }));

    return NextResponse.json({ 
        auditLogs,
        totalPages: Math.ceil(totalLogs / limit),
        currentPage: page,
        totalLogs,
    });

  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

    