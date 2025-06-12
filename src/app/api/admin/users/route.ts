
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User, connectMongoose } from '@/lib/mongodb'; 
import type { AdminUserView } from '@/types';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const usersFromDb = await User.find({})
      .select('_id name email role createdAt updatedAt') 
      .sort({ createdAt: -1 }) 
      .lean(); 

    const users: AdminUserView[] = usersFromDb.map(user => ({
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role || 'user', 
        createdAt: user.createdAt, 
        updatedAt: user.updatedAt,
    }));

    return NextResponse.json({ users });

  } catch (error: any) {
    console.error('Error fetching users for admin:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, newRole } = await request.json();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId) || !['user', 'admin'].includes(newRole)) {
      return NextResponse.json({ error: 'Invalid input: userId or newRole is missing or invalid.' }, { status: 400 });
    }

    await connectMongoose();

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Safety check: Prevent demoting the last admin
    if (targetUser.role === 'admin' && newRole === 'user') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last admin account.' }, { status: 400 });
      }
    }
    
    // Prevent an admin from changing their own role if they are the only admin
    if (targetUser._id.toString() === session.user.id && targetUser.role === 'admin' && newRole === 'user') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
            return NextResponse.json({ error: 'As the sole admin, you cannot change your own role to user.' }, { status: 400 });
        }
    }


    targetUser.role = newRole;
    await targetUser.save();

    const updatedUser: AdminUserView = {
      _id: targetUser._id.toString(),
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      createdAt: targetUser.createdAt,
      updatedAt: targetUser.updatedAt,
    };

    return NextResponse.json({ message: 'User role updated successfully.', user: updatedUser });

  } catch (error: any) {
    console.error('Error updating user role:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
