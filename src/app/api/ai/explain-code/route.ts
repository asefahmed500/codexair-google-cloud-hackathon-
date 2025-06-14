
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { explainCode, type ExplainCodeInput } from '@/ai/flows/explain-code-flow';
import { z } from 'genkit'; // Use genkit's Zod instance if preferred, or plain 'zod'

// Define the input schema locally for validation within the API route
const LocalExplainCodeInputSchema = z.object({
  code: z.string({required_error: "Code snippet is required."}).min(1, "Code snippet cannot be empty."),
  language: z.string().optional().describe('The programming language of the code snippet. If not provided, the AI will attempt to infer it.'),
  question: z.string({required_error: "Question is required."}).min(1, "Question cannot be empty."),
});


export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reqBody = await request.json();
    
    let validatedInput: ExplainCodeInput;
    try {
      validatedInput = LocalExplainCodeInputSchema.parse(reqBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid input', details: err.errors.map(e => e.message).join(', ') }, { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid input processing error' }, { status: 400 });
    }
    
    const { code, language, question } = validatedInput;

    if (code.length > 15000) { // Limit code length
        return NextResponse.json({ error: 'Code snippet is too long. Maximum 15,000 characters allowed.' }, { status: 413 });
    }
    if (question.length > 1000) { // Limit question length
        return NextResponse.json({ error: 'Question is too long. Maximum 1,000 characters allowed.' }, { status: 413 });
    }


    const result = await explainCode({ code, language, question });
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error in /api/ai/explain-code:', error);
    let errorMessage = 'Internal server error during code explanation';
    if (error.message.toLowerCase().includes('genkit') || error.message.toLowerCase().includes('ai model') || error.message.toLowerCase().includes('flow')) {
        errorMessage = `AI processing error: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}




