
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { AuditLog, connectMongoose, type AuditLogActionType } from '@/lib/mongodb';
import mongoose from 'mongoose';
import { z } from 'zod';

const auditActionRequestSchema = z.object({
  auditActionType: z.custom<AuditLogActionType>((val) => {
    // This validation is a bit tricky because AuditLogActionType is derived from an array.
    // For simplicity, we'll trust the frontend sends a valid one if this becomes complex.
    // A more robust way would be to define the enum explicitly in Zod here.
    // For now, we assume it's a string that matches one of the predefined action types.
    return typeof val === 'string' && val.length > 0;
  }, { message: "Invalid auditActionType" }),
  details: z.any().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin' || !session.user.id || !session.user.email) {
      return NextResponse.json({ error: 'Forbidden or invalid admin session' }, { status: 403 });
    }

    const reqBody = await request.json();
    const validationResult = auditActionRequestSchema.safeParse(reqBody);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { auditActionType, details } = validationResult.data;

    await connectMongoose();

    const newAuditLog = new AuditLog({
      adminUserId: new mongoose.Types.ObjectId(session.user.id),
      adminUserEmail: session.user.email,
      action: auditActionType, // This should be one of the valid AuditLogActionType values
      details: details || {},
      timestamp: new Date(),
    });

    await newAuditLog.save();

    return NextResponse.json({ success: true, message: 'Admin action logged successfully.' });

  } catch (error: any) {
    console.error('[API/admin/audit-action] Error logging admin action:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
