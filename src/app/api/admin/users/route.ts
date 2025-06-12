
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User, AuditLog, connectMongoose } from '@/lib/mongodb'; 
import type { AdminUserView } from '@/types';
import mongoose from 'mongoose';

async function createAuditLog(adminUser: { id: string, email?: string | null }, action: string, targetUser?: any, details?: any) {
  try {
    await connectMongoose();
    await new AuditLog({
      adminUserId: adminUser.id,
      adminUserEmail: adminUser.email || 'N/A',
      action,
      targetUserId: targetUser?._id,
      targetUserEmail: targetUser?.email,
      details,
    }).save();
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Decide if this failure should impact the main operation. For now, it won't.
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const usersFromDb = await User.find({})
      .select('_id name email role status createdAt updatedAt') 
      .sort({ createdAt: -1 }) 
      .lean(); 

    const users: AdminUserView[] = usersFromDb.map(user => ({
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        status: user.status || 'active', 
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
    if (!session?.user || session.user.role !== 'admin' || !session.user.id || !session.user.email) {
      return NextResponse.json({ error: 'Forbidden or invalid admin session' }, { status: 403 });
    }

    const { userId, newRole, newStatus } = await request.json();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: 'Invalid input: userId is missing or invalid.' }, { status: 400 });
    }
    if (newRole && !['user', 'admin'].includes(newRole)) {
        return NextResponse.json({ error: 'Invalid input: newRole is invalid.' }, { status: 400 });
    }
    if (newStatus && !['active', 'suspended'].includes(newStatus)) {
        return NextResponse.json({ error: 'Invalid input: newStatus is invalid.' }, { status: 400 });
    }
    if (!newRole && !newStatus) {
        return NextResponse.json({ error: 'Invalid input: newRole or newStatus must be provided.' }, { status: 400 });
    }


    await connectMongoose();

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    let message = 'User updated successfully.';
    const originalRole = targetUser.role;
    const originalStatus = targetUser.status;

    if (newRole) {
      if (targetUser.role === 'admin' && newRole === 'user') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last admin account.' }, { status: 400 });
        }
      }
      
      if (targetUser._id.toString() === session.user.id && targetUser.role === 'admin' && newRole === 'user') {
          const adminCount = await User.countDocuments({ role: 'admin' });
          if (adminCount <= 1) {
              return NextResponse.json({ error: 'As the sole admin, you cannot change your own role to user.' }, { status: 400 });
          }
      }
      targetUser.role = newRole;
      message = 'User role updated successfully.';
      if (originalRole !== newRole) {
        await createAuditLog(session.user, 'USER_ROLE_CHANGED', targetUser, { previousRole: originalRole, newRole });
      }
    }

    if (newStatus) {
      if (targetUser._id.toString() === session.user.id && newStatus === 'suspended') {
        const activeAdminCount = await User.countDocuments({ role: 'admin', status: 'active' });
        if (activeAdminCount <= 1) {
          return NextResponse.json({ error: 'Cannot suspend your own account as the last active admin.' }, { status: 400 });
        }
      }
      if (targetUser.role === 'admin' && targetUser.status === 'active' && newStatus === 'suspended') {
        const activeAdminCount = await User.countDocuments({ role: 'admin', status: 'active' });
        if (activeAdminCount <= 1) {
             return NextResponse.json({ error: 'Cannot suspend the last active admin account.' }, { status: 400 });
        }
      }
      targetUser.status = newStatus;
      message = newRole ? message + ' User status updated successfully.' : 'User status updated successfully.';
      if (originalStatus !== newStatus) {
        const action = newStatus === 'active' ? 'USER_STATUS_CHANGED_ACTIVE' : 'USER_STATUS_CHANGED_SUSPENDED';
        await createAuditLog(session.user, action, targetUser, { previousStatus: originalStatus, newStatus });
      }
    }

    await targetUser.save();

    const updatedUser: AdminUserView = {
      _id: targetUser._id.toString(),
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      status: targetUser.status,
      createdAt: targetUser.createdAt,
      updatedAt: targetUser.updatedAt,
    };

    return NextResponse.json({ message, user: updatedUser });

  } catch (error: any)
 {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
