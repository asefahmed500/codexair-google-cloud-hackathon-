
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User as UserModel, connectMongoose } from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) { // Check for user object in session
      return NextResponse.json({ error: 'Unauthorized: No session user found.' }, { status: 401 });
    }

    await connectMongoose();
    let userDoc;

    // Primary lookup: by user ID from session, if valid
    if (session.user.id && mongoose.Types.ObjectId.isValid(session.user.id)) {
      userDoc = await UserModel.findById(session.user.id)
        .select('name email image role status createdAt')
        .lean();
    } 
    
    // Fallback lookup: by email, if user not found by ID or ID is invalid/missing, and email is present
    if (!userDoc && session.user.email) {
      console.warn(`[API/Profile] User not found by ID: '${session.user.id}'. Attempting lookup by email: '${session.user.email}'. This might indicate an issue with session ID propagation or a stale ID if the database was recently modified externally.`);
      userDoc = await UserModel.findOne({ email: session.user.email })
        .select('name email image role status createdAt')
        .lean();
    }

    if (!userDoc) {
      console.error(`[API/Profile] User not found in database using ID ('${session.user.id}') or email ('${session.user.email}'). Session:`, session);
      return NextResponse.json({ error: 'User not found in database. Your session might be invalid or the user record is missing.' }, { status: 404 });
    }

    return NextResponse.json({
      id: userDoc._id.toString(),
      name: userDoc.name,
      email: userDoc.email,
      image: userDoc.image,
      role: userDoc.role,
      status: userDoc.status,
      createdAt: userDoc.createdAt,
    });

  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

    