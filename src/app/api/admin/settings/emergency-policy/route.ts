
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GlobalSetting, AuditLog, connectMongoose, type AuditLogActionType } from '@/lib/mongodb';
import mongoose from 'mongoose';

const EMERGENCY_POLICY_SETTING_NAME = 'emergencyPolicy';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin' || !session.user.id || !session.user.email) {
      return NextResponse.json({ error: 'Forbidden or invalid admin session' }, { status: 403 });
    }

    const { enabled } = await request.json();
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid "enabled" payload, must be boolean.' }, { status: 400 });
    }

    await connectMongoose();

    const updatedSetting = await GlobalSetting.findOneAndUpdate(
      { settingName: EMERGENCY_POLICY_SETTING_NAME },
      { $set: { value: { enabled }, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Log the audit event
    const auditActionType: AuditLogActionType = enabled ? 'EMERGENCY_POLICY_ACTIVATED' : 'EMERGENCY_POLICY_DEACTIVATED';
    await new AuditLog({
      adminUserId: new mongoose.Types.ObjectId(session.user.id),
      adminUserEmail: session.user.email,
      action: auditActionType,
      details: { newPolicyState: enabled ? 'ACTIVE' : 'INACTIVE' },
      timestamp: new Date(),
    }).save();

    return NextResponse.json({ success: true, newStatus: updatedSetting?.value?.enabled });

  } catch (error: any) {
    console.error('[API/admin/settings/emergency-policy PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
