
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { ContactMessage, connectMongoose } from '@/lib/mongodb';
import type { ContactMessage as ContactMessageType } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const messagesFromDb = await ContactMessage.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalMessages = await ContactMessage.countDocuments();

    const messages: ContactMessageType[] = messagesFromDb.map((msg: any) => ({
      _id: msg._id.toString(),
      name: msg.name,
      email: msg.email,
      message: msg.message,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
    }));

    return NextResponse.json({
      messages,
      totalPages: Math.ceil(totalMessages / limit),
      currentPage: page,
      totalMessages,
    });

  } catch (error: any) {
    console.error('Error fetching contact messages:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
