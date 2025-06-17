
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next'; // Required even if not explicitly used for permissions, NextAuth needs it
import { authOptions } from '@/lib/auth';
import { GlobalSetting, connectMongoose } from '@/lib/mongodb';

const EMERGENCY_POLICY_SETTING_NAME = 'emergencyPolicy';

export async function GET(request: NextRequest) {
  try {
    // While this endpoint is public, we ensure session context is available for NextAuth
    await getServerSession(authOptions); 

    await connectMongoose();

    const setting = await GlobalSetting.findOne({ settingName: EMERGENCY_POLICY_SETTING_NAME }).lean();

    const isEnabled = setting?.value?.enabled === true; // Default to false if not set or value is incorrect

    return NextResponse.json({ enabled: isEnabled });

  } catch (error: any) {
    console.error('[API/settings/emergency-policy GET] Error:', error);
    // Return a default safe state in case of error
    return NextResponse.json({ enabled: false, error: 'Failed to retrieve policy status' }, { status: 500 });
  }
}
