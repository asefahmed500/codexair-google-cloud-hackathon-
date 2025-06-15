
import { NextRequest, NextResponse } from 'next/server';
import { connectMongoose, ContactMessage } from '@/lib/mongodb';
import { z } from 'zod';

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100, "Name is too long."),
  email: z.string().email("Invalid email address.").max(100, "Email is too long."),
  message: z.string().min(1, "Message is required.").max(1000, "Message is too long."),
});

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json();
    
    const validationResult = contactFormSchema.safeParse(reqBody);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, email, message } = validationResult.data;

    await connectMongoose();

    const newContactMessage = new ContactMessage({
      name,
      email,
      message,
      isRead: false,
      createdAt: new Date(),
    });

    await newContactMessage.save();

    return NextResponse.json({ success: true, message: 'Message received successfully!' }, { status: 201 });

  } catch (error: any) {
    console.error('Error in /api/contact:', error);
    let errorMessage = 'Internal server error while processing your message.';
    if (error.name === 'MongoServerError' && error.code === 11000) {
      errorMessage = 'There was an issue saving your message (duplicate entry potential). Please try again.';
    } else if (error.message) {
      // Avoid leaking too much internal detail
      // errorMessage = `Processing error: ${error.message.substring(0, 100)}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
