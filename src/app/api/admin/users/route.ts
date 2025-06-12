
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User, connectMongoose } from '@/lib/mongodb'; // Assuming User model is exported from mongodb
import type { AdminUserView } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const usersFromDb = await User.find({})
      .select('_id name email role createdAt updatedAt') // Select specific fields
      .sort({ createdAt: -1 }) // Sort by creation date
      .lean(); // Use .lean() for faster, plain JS objects

    // Map to AdminUserView to ensure consistent structure, especially for dates
    const users: AdminUserView[] = usersFromDb.map(user => ({
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role || 'user', // Default role if somehow missing
        createdAt: user.createdAt, 
        updatedAt: user.updatedAt,
    }));


    return NextResponse.json({ users });

  } catch (error: any) {
    console.error('Error fetching users for admin:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
