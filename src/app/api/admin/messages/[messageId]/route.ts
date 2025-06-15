
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { ContactMessage, connectMongoose } from '@/lib/mongodb';
import mongoose from 'mongoose';

// PATCH to update isRead status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageId = params.messageId;
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
    }

    const { isRead } = await request.json();
    if (typeof isRead !== 'boolean') {
      return NextResponse.json({ error: 'Invalid isRead value' }, { status: 400 });
    }

    await connectMongoose();

    const updatedMessage = await ContactMessage.findByIdAndUpdate(
      messageId,
      { $set: { isRead } },
      { new: true }
    ).lean();

    if (!updatedMessage) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: updatedMessage });

  } catch (error: any) {
    console.error('Error updating message status:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

// DELETE a message
export async function DELETE(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageId = params.messageId;
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
    }

    await connectMongoose();

    const deletedMessage = await ContactMessage.findByIdAndDelete(messageId);

    if (!deletedMessage) {
      return NextResponse.json({ error: 'Message not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Message deleted successfully' });

  } catch (error: any) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
