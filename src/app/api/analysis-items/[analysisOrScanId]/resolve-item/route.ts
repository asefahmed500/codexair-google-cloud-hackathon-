
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Analysis, RepositoryScan, connectMongoose, PullRequest } from '@/lib/mongodb';
import mongoose from 'mongoose';
import type { SecurityIssue, Suggestion, CodeAnalysis, RepositoryScanResult } from '@/types';
import { z } from 'zod';

const itemIdentifierSchema = z.object({
  title: z.string(),
  file: z.string(),
  line: z.number().optional(),
  description: z.string(), // Using description for more robust matching
});

const resolveItemRequestSchema = z.object({
  sourceType: z.enum(['pr_analysis', 'repo_scan']),
  itemType: z.enum(['security', 'suggestion']),
  itemIdentifier: itemIdentifierSchema,
  resolved: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { analysisOrScanId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { analysisOrScanId } = params;
    if (!mongoose.Types.ObjectId.isValid(analysisOrScanId)) {
      return NextResponse.json({ error: 'Invalid Analysis or Scan ID' }, { status: 400 });
    }

    const reqBody = await request.json();
    const validationResult = resolveItemRequestSchema.safeParse(reqBody);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { sourceType, itemType, itemIdentifier, resolved } = validationResult.data;

    await connectMongoose();

    let parentDocument: (mongoose.Document & (CodeAnalysis | RepositoryScanResult)) | null = null;
    let itemArrayPath: string = '';

    if (sourceType === 'pr_analysis') {
      parentDocument = await Analysis.findById(analysisOrScanId).populate({
        path: 'pullRequestId',
        select: 'userId' 
      });
      itemArrayPath = itemType === 'security' ? 'securityIssues' : 'suggestions';
      
      // Permission check for PR Analysis
      if (parentDocument && session.user.role !== 'admin') {
        const pr = (parentDocument as any).pullRequestId as any; // Access populated field
        if (!pr || pr.userId?.toString() !== session.user.id) {
          return NextResponse.json({ error: 'Forbidden: You do not have permission to modify this PR analysis item.' }, { status: 403 });
        }
      }

    } else { // repo_scan
      parentDocument = await RepositoryScan.findById(analysisOrScanId);
      itemArrayPath = itemType === 'security' ? 'securityIssues' : 'suggestions';

      // Permission check for Repo Scan
      if (parentDocument && session.user.role !== 'admin' && (parentDocument as RepositoryScanResult).userId?.toString() !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden: You do not have permission to modify this repository scan item.' }, { status: 403 });
      }
    }

    if (!parentDocument) {
      return NextResponse.json({ error: `${sourceType === 'pr_analysis' ? 'Analysis' : 'Scan'} document not found` }, { status: 404 });
    }

    const itemsArray = (parentDocument as any)[itemArrayPath] as (SecurityIssue | Suggestion)[];
    if (!itemsArray || !Array.isArray(itemsArray)) {
      return NextResponse.json({ error: `Could not find ${itemType} items in the document.`}, { status: 404 });
    }
    
    let itemUpdated = false;
    for (let i = 0; i < itemsArray.length; i++) {
      const item = itemsArray[i];
      // Match based on title, file, description, and optionally line
      const lineMatch = itemIdentifier.line !== undefined ? item.line === itemIdentifier.line : true; // If line is undefined in key, it's a wildcard for item.line
      const exactLineMatch = itemIdentifier.line !== undefined && item.line !== undefined ? item.line === itemIdentifier.line : itemIdentifier.line === undefined && item.line === undefined;


      if (
        item.title === itemIdentifier.title &&
        item.file === itemIdentifier.file &&
        item.description === itemIdentifier.description &&
        exactLineMatch 
      ) {
        if (item.resolved !== resolved) { // Only update if there's a change
          item.resolved = resolved;
          itemUpdated = true;
        }
        break; // Found and processed the item
      }
    }

    if (!itemUpdated) {
      console.warn(`[API/resolve-item] Item not found or no change needed for identifier:`, itemIdentifier, `in ${analysisOrScanId}`);
      // Return success even if no change needed, as the desired state is achieved.
      // Or, could return 304 Not Modified, but for simplicity, 200 is fine.
      // If strict "item not found" is required, change this.
      // For now, assume if not found, something is odd but client might have stale data.
      // Let's return an error if it wasn't found to be safe.
      let itemFoundButNoChange = false;
       for (let i = 0; i < itemsArray.length; i++) {
          const item = itemsArray[i];
          const exactLineMatch = itemIdentifier.line !== undefined && item.line !== undefined ? item.line === itemIdentifier.line : itemIdentifier.line === undefined && item.line === undefined;
          if (item.title === itemIdentifier.title && item.file === itemIdentifier.file && item.description === itemIdentifier.description && exactLineMatch) {
            itemFoundButNoChange = true;
            break;
          }
       }
       if(!itemFoundButNoChange){
         console.error(`[API/resolve-item] Item strictly not found with identifier:`, itemIdentifier, `in ${analysisOrScanId}`);
         return NextResponse.json({ error: 'Item not found with the provided identifiers.' }, { status: 404 });
       }
    }

    if (itemUpdated) {
        await parentDocument.save();
        console.log(`[API/resolve-item] Successfully updated item in ${analysisOrScanId}. New resolved state: ${resolved}`);
    } else {
        console.log(`[API/resolve-item] No update performed for item in ${analysisOrScanId} as it was already in the desired state or not found by strict match for update.`);
    }


    return NextResponse.json({ success: true, message: 'Item resolved status updated.' });

  } catch (error: any) {
    console.error('[API/resolve-item] Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
