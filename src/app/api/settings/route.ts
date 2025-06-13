
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User, connectMongoose } from '@/lib/mongodb';
import mongoose from 'mongoose';

// GET: Fetch current user settings (or data relevant to settings page)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    if (!mongoose.Types.ObjectId.isValid(session.user.id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }
    
    const user = await User.findById(session.user.id).select('name email image').lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      name: user.name,
      email: user.email, // Email is generally not updatable by user directly via settings
      image: user.image,
    });

  } catch (error: any) {
    console.error('Error fetching user settings:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

// PATCH: Update user settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required and must be a non-empty string.' }, { status: 400 });
    }
    if (name.length > 50) {
        return NextResponse.json({ error: 'Name cannot exceed 50 characters.' }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(session.user.id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      { $set: { name: name.trim() } },
      { new: true, runValidators: true } // return updated doc, run schema validators
    ).select('name email image');

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found or update failed' }, { status: 404 });
    }
    
    // Note: NextAuth session also needs to be updated for name change to reflect immediately.
    // This typically happens on next sign-in or if you implement session update logic.
    // For now, the DB is updated. The client should probably re-fetch session or user data.

    return NextResponse.json({
      message: 'Settings updated successfully.',
      user: {
        name: updatedUser.name,
        email: updatedUser.email,
        image: updatedUser.image,
      }
    });

  } catch (error: any) {
    console.error('Error updating user settings:', error);
    if (error.name === 'ValidationError') {
        return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
