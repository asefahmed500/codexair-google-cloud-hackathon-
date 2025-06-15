
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPullRequestDetails, getPullRequestFiles, getFileContent, getRepositoryDetails } from '@/lib/github';
import { analyzeCode } from '@/ai/flows/code-quality-analysis';
import { summarizePrAnalysis } from '@/ai/flows/summarize-pr-analysis-flow';
import { PullRequest, Analysis, Repository, connectMongoose } from '@/lib/mongodb';
import type { CodeAnalysisOutput as AIAnalysisOutput, FileAnalysisItem, PullRequest as PRType, CodeFile as CodeFileType } from '@/types';
import { ai } from '@/ai/genkit';
import mongoose from 'mongoose';

const MAX_FILES_TO_ANALYZE = 10;
const MAX_CONTENT_LENGTH_FOR_ANALYSIS = 20000; 
const EMBEDDING_DIMENSIONS = 768;
const FALLBACK_SUMMARY_MESSAGE = "Overall analysis summary could not be generated for this pull request.";
const EXCLUDED_FILE_PATTERNS_FOR_ANALYSIS = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.min\.(js|css)$/, // Minified files
    /\.(map)$/, // Source maps
    /\.(lock)$/ // Generic lock files
];

function extractAddedLinesFromPatch(patch?: string): string {
  if (!patch) return '';
  const lines = patch.split('\n');
  const addedLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.substring(1));
    }
  }
  return addedLines.join('\n');
}

export async function POST(request: NextRequest) {
  let owner: string | undefined, repoName: string | undefined, pullNumber: number | undefined;
  let localRepoIdForCatch: string | undefined;
  let pullRequestIdForCatch: string | undefined;

  try {
    console.log('[API/ANALYZE] Received analysis request.');
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('[API/ANALYZE] Unauthorized: No session user ID.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`[API/ANALYZE] Authenticated user: ${session.user.id}`);

    await connectMongoose();
    console.log('[API/ANALYZE] Connected to Mongoose.');

    const reqBody = await request.json();
    owner = reqBody.owner;
    repoName = reqBody.repoName;
    const pullNumberStr = reqBody.pullNumber;
    pullNumber = parseInt(pullNumberStr);

    if (!owner || !repoName || isNaN(pullNumber)) {
      console.error('[API/ANALYZE] Invalid input:', { owner, repoName, pullNumberStr });
      return NextResponse.json({ error: 'Missing owner, repoName, or pullNumber' }, { status: 400 });
    }
    
    const repoFullName = `${owner}/${repoName}`;
    console.log(`[API/ANALYZE] Initiating analysis for ${repoFullName} PR #${pullNumber} by user ${session.user.id}`);

    let localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
      console.log(`[API/ANALYZE] Repository ${repoFullName} not found locally for user ${session.user.id}. Fetching from GitHub...`);
      const ghRepoDetails = await getRepositoryDetails(owner, repoName);
      if (!ghRepoDetails) {
        console.error(`[API/ANALYZE] GitHub repository ${repoFullName} not found or inaccessible.`);
        return NextResponse.json({ error: `GitHub repository ${repoFullName} not found or inaccessible.` }, { status: 404 });
      }
      localRepo = await Repository.findOneAndUpdate(
        { githubId: ghRepoDetails.id, userId: session.user.id },
        {
          $set: {
            name: ghRepoDetails.name,
            fullName: ghRepoDetails.full_name,
            owner: ghRepoDetails.owner.login,
            githubId: ghRepoDetails.id,
            language: ghRepoDetails.language || 'N/A',
            stars: ghRepoDetails.stargazers_count || 0,
            isPrivate: ghRepoDetails.private,
            userId: session.user.id,
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[API/ANALYZE] Synced repository ${localRepo.fullName} with local ID ${localRepo._id}`);
    } else {
      console.log(`[API/ANALYZE] Found local repository ${localRepo.fullName} with ID ${localRepo._id}`);
    }
    if (!localRepo) {
        console.error(`[API/ANALYZE] Repository ${repoFullName} not found locally or could not be synced.`);
        return NextResponse.json({ error: `Repository ${repoFullName} not found locally or could not be synced.` }, { status: 404 });
    }
    localRepoIdForCatch = localRepo._id.toString();

    const updatedPrForPending = await PullRequest.findOneAndUpdate(
        { repositoryId: localRepo._id.toString(), number: pullNumber },
        { $set: { analysisStatus: 'pending', owner: owner, repoName: repoName, userId: session.user.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (!updatedPrForPending) {
        console.error(`[API/ANALYZE] Failed to upsert PR #${pullNumber} for ${repoFullName} to set pending status.`);
        // This is a significant issue, but we might still be able to proceed if GitHub fetch works
    } else {
        pullRequestIdForCatch = updatedPrForPending._id.toString();
        console.log(`[API/ANALYZE] Set PR ${pullRequestIdForCatch} (#${pullNumber}) status to 'pending' for ${repoFullName}.`);
    }


    console.log(`[API/ANALYZE] Fetching PR details for ${repoFullName} PR #${pullNumber} from GitHub...`);
    const ghPullRequest = await getPullRequestDetails(owner, repoName, pullNumber);
    if (!ghPullRequest) {
      if (pullRequestIdForCatch) {
          await PullRequest.updateOne(
            { _id: new mongoose.Types.ObjectId(pullRequestIdForCatch) },
            { $set: { analysisStatus: 'failed' } }
          );
      } else if (localRepoIdForCatch) { // Fallback if PR doc wasn't created/found
          await PullRequest.updateOne(
            { repositoryId: localRepoIdForCatch, number: pullNumber },
            { $set: { analysisStatus: 'failed' } }
          );
      }
      console.error('[API/ANALYZE] Pull request not found on GitHub.');
      return NextResponse.json({ error: 'Pull request not found on GitHub' }, { status: 404 });
    }
    console.log(`[API/ANALYZE] Fetched PR details from GitHub: ${ghPullRequest.title}`);


    const ghFiles = await getPullRequestFiles(owner, repoName, pullNumber);
    console.log(`[API/ANALYZE] Found ${ghFiles.length} files in PR. Filtering relevant files (max ${MAX_FILES_TO_ANALYZE}).`);

    const filesToConsider = ghFiles
      .filter(file =>
        (file.status === 'added' || file.status === 'modified' || file.status === 'renamed') &&
        file.filename?.match(/\.(js|ts|jsx|tsx|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i) &&
        !EXCLUDED_FILE_PATTERNS_FOR_ANALYSIS.some(pattern => pattern.test(file.filename!)) && 
        (file.changes || 0) < 2000 && // Avoid extremely large diffs
        file.filename // Ensure filename is not undefined
      )
      .slice(0, MAX_FILES_TO_ANALYZE);
    console.log(`[API/ANALYZE] ${filesToConsider.length} files selected for detailed analysis.`);

    const fileAnalysesPromises = filesToConsider.map(async (file): Promise<FileAnalysisItem | null> => {
        let analysisContext = "full file";
        let contentToAnalyze: string | null = null;
        console.log(`[API/ANALYZE] Processing file: ${file.filename}, status: ${file.status}`);
        try {
          if (file.status === 'added' || file.status === 'renamed') {
            contentToAnalyze = await getFileContent(owner!, repoName!, file.filename, ghPullRequest.head.sha);
            analysisContext = file.status === 'added' ? "full file (added)" : "full file (renamed)";
          } else if (file.status === 'modified' && file.patch) {
            const addedLines = extractAddedLinesFromPatch(file.patch);
            if (addedLines.trim() !== '') {
              contentToAnalyze = addedLines;
              analysisContext = "diff (added lines)";
            } else {
              console.warn(`[API/ANALYZE] Patch for modified file ${file.filename} yielded no added lines. Analyzing full content as fallback.`);
              contentToAnalyze = await getFileContent(owner!, repoName!, file.filename, ghPullRequest.head.sha);
              analysisContext = "full file (fallback from diff)";
            }
          } else {
            console.warn(`[API/ANALYZE] Unhandled file status or condition for ${file.filename} (status: ${file.status}). Analyzing full content as fallback.`);
            contentToAnalyze = await getFileContent(owner!, repoName!, file.filename, ghPullRequest.head.sha);
            analysisContext = "full file (general fallback)";
          }

          if (!contentToAnalyze || contentToAnalyze.trim() === '') {
            console.warn(`[API/ANALYZE] No valid content for ${file.filename} (context: ${analysisContext}). Skipping AI analysis and embedding.`);
            return null;
          }

          if (contentToAnalyze.length > MAX_CONTENT_LENGTH_FOR_ANALYSIS) {
             console.warn(`[API/ANALYZE] Content for ${file.filename} is too large (${contentToAnalyze.length} chars), truncating to ${MAX_CONTENT_LENGTH_FOR_ANALYSIS}.`);
             contentToAnalyze = contentToAnalyze.substring(0, MAX_CONTENT_LENGTH_FOR_ANALYSIS);
          }
          console.log(`[API/ANALYZE] Calling analyzeCode for ${file.filename} (context: ${analysisContext}, length: ${contentToAnalyze.length} chars)`);
          const aiResponse: AIAnalysisOutput = await analyzeCode({ code: contentToAnalyze, filename: file.filename });
          console.log(`[API/ANALYZE] analyzeCode completed for ${file.filename}. Quality: ${aiResponse.qualityScore}`);


          let fileEmbeddingVector: number[] | undefined = undefined;
          if (contentToAnalyze && contentToAnalyze.trim() !== "") { // Check again after potential truncation
            try {
              console.log(`[API/ANALYZE] Generating embedding for ${file.filename}...`);
              const embedApiResponse = await ai.embed({
                embedder: 'googleai/text-embedding-004',
                content: contentToAnalyze,
              });

              if (Array.isArray(embedApiResponse) &&
                  embedApiResponse.length > 0 &&
                  embedApiResponse[0] &&
                  typeof embedApiResponse[0] === 'object' &&
                  embedApiResponse[0] !== null &&
                  Object.prototype.hasOwnProperty.call(embedApiResponse[0], 'embedding') &&
                  Array.isArray(embedApiResponse[0].embedding) &&
                  embedApiResponse[0].embedding.length === EMBEDDING_DIMENSIONS &&
                  embedApiResponse[0].embedding.every((n: any) => typeof n === 'number' && isFinite(n))
                 ) {
                fileEmbeddingVector = embedApiResponse[0].embedding;
                console.log(`[API/ANALYZE] Embedding success for ${file.filename} (${fileEmbeddingVector.length} dims).`);
              } else {
                 console.warn(`[API/ANALYZE] Embedding for ${file.filename} invalid or wrong dimensions. Expected ${EMBEDDING_DIMENSIONS}, got ${embedApiResponse[0]?.embedding?.length}. Resp snippet:`, JSON.stringify(embedApiResponse).substring(0, 200));
              }
            } catch (embeddingError: any) {
              console.error(`[API/ANALYZE] Embedding error for ${file.filename}: ${embeddingError.message}. Content length: ${contentToAnalyze.length}. Error details:`, embeddingError);
            }
          } else {
            console.log(`[API/ANALYZE] Skipping embedding for ${file.filename} (empty/whitespace content).`);
          }

          return {
            filename: file.filename,
            qualityScore: aiResponse.qualityScore,
            complexity: aiResponse.complexity,
            maintainability: aiResponse.maintainability,
            securityIssues: aiResponse.securityIssues || [],
            suggestions: aiResponse.suggestions || [],
            metrics: aiResponse.metrics || { linesOfCode: 0, cyclomaticComplexity: 0, cognitiveComplexity: 0, duplicateBlocks: 0 },
            aiInsights: aiResponse.aiInsights || '',
            vectorEmbedding: fileEmbeddingVector,
          };
        } catch (error: any) {
          console.error(`[API/ANALYZE] CRITICAL Error processing file ${file.filename}:`, error.message, error.stack);
          return null; // Ensure null is returned so Promise.all doesn't break
        }
      });

    const fileAnalysesResults = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];
    console.log(`[API/ANALYZE] Successfully analyzed ${fileAnalysesResults.length} out of ${filesToConsider.length} considered files.`);

    if (fileAnalysesResults.length === 0 && filesToConsider.length > 0) {
        console.warn(`[API/ANALYZE] No files were successfully analyzed with AI, though ${filesToConsider.length} were considered. Check logs for file-specific errors.`);
    }

    const totalAnalyzedFiles = fileAnalysesResults.length;
    const aggregatedQualityScore = totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzedFiles : 0;
    const aggregatedComplexity = totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzedFiles : 0;
    const aggregatedMaintainability = totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzedFiles : 0;
    const allSecurityIssues = fileAnalysesResults.flatMap(a => a.securityIssues || []);
    const allSuggestions = fileAnalysesResults.flatMap(a => a.suggestions || []);
    const totalCriticalIssues = allSecurityIssues.filter(s => s.severity === 'critical').length;
    const totalHighIssues = allSecurityIssues.filter(s => s.severity === 'high').length;
    console.log(`[API/ANALYZE] Aggregated scores: Q=${aggregatedQualityScore.toFixed(1)}, C=${aggregatedComplexity.toFixed(1)}, M=${aggregatedMaintainability.toFixed(1)}`);

    let prLevelSummary = FALLBACK_SUMMARY_MESSAGE;
    if (totalAnalyzedFiles > 0) {
        try {
            const summaryInput = {
                prTitle: ghPullRequest.title,
                overallQualityScore: aggregatedQualityScore,
                totalCriticalIssues: totalCriticalIssues,
                totalHighIssues: totalHighIssues,
                totalSuggestions: allSuggestions.length,
                fileCount: totalAnalyzedFiles,
                perFileSummaries: fileAnalysesResults.map(fa => ({ filename: fa.filename, insight: fa.aiInsights })),
            };
            console.log(`[API/ANALYZE] Generating PR-level summary for PR #${pullNumber}...`);
            const summaryOutput = await summarizePrAnalysis(summaryInput);
            prLevelSummary = summaryOutput.prSummary;
            console.log(`[API/ANALYZE] Generated PR-level summary: "${prLevelSummary.substring(0,100)}..."`);
        } catch (summaryError: any) {
            console.error(`[API/ANALYZE] Error generating PR-level summary for PR #${pullNumber}:`, summaryError.message, summaryError.stack);
            // prLevelSummary remains FALLBACK_SUMMARY_MESSAGE
        }
    } else {
        console.log('[API/ANALYZE] Skipping PR-level summary as no files were analyzed.');
    }

    const finalAnalysisData = {
      pullRequestId: '', // Will be set after PR doc is saved/found
      qualityScore: aggregatedQualityScore,
      complexity: aggregatedComplexity,
      maintainability: aggregatedMaintainability,
      securityIssues: allSecurityIssues,
      suggestions: allSuggestions,
      metrics: {
        linesOfCode: fileAnalysesResults.reduce((sum, fa) => sum + (fa.metrics?.linesOfCode || 0), 0),
        cyclomaticComplexity: totalAnalyzedFiles > 0 ? parseFloat((fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cyclomaticComplexity || 0), 0) / totalAnalyzedFiles).toFixed(1)) : 0,
        cognitiveComplexity: totalAnalyzedFiles > 0 ? parseFloat((fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cognitiveComplexity || 0), 0) / totalAnalyzedFiles).toFixed(1)) : 0,
        duplicateBlocks: fileAnalysesResults.reduce((sum, fa) => sum + (fa.metrics?.duplicateBlocks || 0), 0),
      },
      aiInsights: prLevelSummary,
      fileAnalyses: fileAnalysesResults,
      createdAt: new Date(), // Explicitly set creation time for analysis
    };

    const prFiles: CodeFileType[] = ghFiles.map(f => ({
        filename: f.filename,
        status: f.status as CodeFileType['status'],
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch || '',
      }));

    console.log(`[API/ANALYZE] Preparing to save PullRequest document for ${repoFullName} PR #${pullNumber}. Local repo ID: ${localRepo._id.toString()}`);
    let savedPR = await PullRequest.findOne({
      repositoryId: localRepo._id.toString(),
      number: pullNumber,
    });

    if (!savedPR) {
      console.log(`[API/ANALYZE] No existing PR document found. Creating new one.`);
      savedPR = new PullRequest({
        repositoryId: localRepo._id.toString(),
        owner: owner,
        repoName: repoName,
        githubId: ghPullRequest.id,
        number: pullNumber,
        title: ghPullRequest.title,
        body: ghPullRequest.body || '',
        state: ghPullRequest.state as PRType['state'],
        author: {
          login: ghPullRequest.user?.login || 'unknown',
          avatar: ghPullRequest.user?.avatar_url || '',
        },
        files: prFiles,
        userId: session.user.id, // User who initiated this
        createdAt: new Date(ghPullRequest.created_at),
        updatedAt: new Date(ghPullRequest.updated_at),
        analysisStatus: 'pending', // Will be updated shortly
      });
    } else {
      console.log(`[API/ANALYZE] Existing PR document found (ID: ${savedPR._id}). Updating it.`);
      savedPR.title = ghPullRequest.title;
      savedPR.body = ghPullRequest.body || '';
      savedPR.state = ghPullRequest.state as PRType['state'];
      savedPR.files = prFiles; // Update files with latest from GitHub
      savedPR.owner = owner;
      savedPR.repoName = repoName;
      savedPR.author = { // Update author info
          login: ghPullRequest.user?.login || savedPR.author?.login || 'unknown',
          avatar: ghPullRequest.user?.avatar_url || savedPR.author?.avatar || '',
      };
      savedPR.updatedAt = new Date(ghPullRequest.updated_at); // Update timestamp from GitHub
      savedPR.userId = savedPR.userId || session.user.id; // Ensure userId is set
    }
    await savedPR.save();
    pullRequestIdForCatch = savedPR._id.toString(); // Update for catch block
    console.log(`[API/ANALYZE] Saved/Updated PullRequest document ID: ${savedPR._id}`);

    finalAnalysisData.pullRequestId = savedPR._id.toString();

    if (savedPR.analysis) {
        let oldAnalysisId = savedPR.analysis;
        if (typeof oldAnalysisId !== 'string' && oldAnalysisId && (oldAnalysisId as any).toString) { // Handle ObjectId case
            oldAnalysisId = (oldAnalysisId as any).toString();
        }
        if (oldAnalysisId && mongoose.Types.ObjectId.isValid(oldAnalysisId as string)) {
            console.log(`[API/ANALYZE] Found old analysis (ID: ${oldAnalysisId}) for PR ${savedPR._id}. Deleting it.`);
            await Analysis.deleteOne({ _id: new mongoose.Types.ObjectId(oldAnalysisId as string) });
            console.log(`[API/ANALYZE] Deleted old analysis ${oldAnalysisId}.`);
        } else if (savedPR.analysis) {
            console.warn(`[API/ANALYZE] Invalid or non-ObjectId old analysis ID found for PR ${savedPR._id}: ${savedPR.analysis}. Skipping deletion.`);
        }
    }

    console.log(`[API/ANALYZE] Final analysis data before saving Analysis doc (snippet):`, JSON.stringify(finalAnalysisData, (key, value) => key === 'vectorEmbedding' ? `[${value?.length || 0} numbers]` : value, 2).substring(0, 1000) + "...");
    const analysisDoc = new Analysis(finalAnalysisData);
    await analysisDoc.save();
    console.log(`[API/ANALYZE] SUCCESSFULLY Saved new Analysis document ID: ${analysisDoc._id} for PR ${savedPR._id}`);

    savedPR.analysis = analysisDoc._id;
    savedPR.analysisStatus = 'analyzed';
    savedPR.qualityScore = aggregatedQualityScore;
    await savedPR.save();
    console.log(`[API/ANALYZE] Updated PullRequest ${savedPR._id} with new analysis ID ${analysisDoc._id} and status 'analyzed'.`);

    const populatedPR = await PullRequest.findById(savedPR._id).populate('analysis').lean();
    console.log('[API/ANALYZE] Analysis process completed successfully.');
    return NextResponse.json({ analysis: analysisDoc.toObject(), pullRequest: populatedPR });

  } catch (error: any) {
    console.error(`[API/ANALYZE] CRITICAL ERROR during PR analysis for ${owner}/${repoName}#${pullNumber}. User: ${session?.user?.id}. Error:`, error.message, error.stack);
    // Log the full error object structure for better debugging if it's not a standard Error instance
    if (!(error instanceof Error)) {
      console.error('[API/ANALYZE] Full error object (non-Error instance):', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }

    if (pullRequestIdForCatch) {
        try {
            await PullRequest.updateOne(
              { _id: new mongoose.Types.ObjectId(pullRequestIdForCatch) },
              { $set: { analysisStatus: 'failed' } }
            );
            console.log(`[API/ANALYZE] Set PR ${pullRequestIdForCatch} status to 'failed' due to error.`);
        } catch (dbError: any) {
            console.error(`[API/ANALYZE] Failed to update PR ${pullRequestIdForCatch} status to 'failed' in DB:`, dbError.message);
        }
    } else if (localRepoIdForCatch && owner && repoName && pullNumber !== undefined) {
         try {
            const currentSession = await getServerSession(authOptions); // Re-fetch session if needed
            await PullRequest.updateOne(
              { repositoryId: localRepoIdForCatch, number: pullNumber, userId: currentSession?.user?.id },
              { $set: { analysisStatus: 'failed' } },
              { upsert: false } // Do not upsert if PR doc was never created
            );
            console.log(`[API/ANALYZE] Attempted to set PR #${pullNumber} in repo ${localRepoIdForCatch} to 'failed' status due to error.`);
        } catch (dbError: any) {
            console.error(`[API/ANALYZE] Failed to update PR status to 'failed' for repo ${localRepoIdForCatch}, PR #${pullNumber}:`, dbError.message);
        }
    }


    let errorMessage = 'Internal server error during analysis';
    let statusCode = 500;

    if (error.message) {
        if (error.message.includes('GitHub API error') || (error.status && (error.status === 401 || error.status === 403 || error.status === 404))) {
            errorMessage = `GitHub API error: ${error.message}`;
            statusCode = error.status || 500;
        } else if (error.message.toLowerCase().includes('genkit') || error.message.toLowerCase().includes('ai model') || error.message.toLowerCase().includes('flow failed')) {
            errorMessage = `AI processing error: ${error.message}`;
        } else if (error.message.includes('payload size exceeds the limit')) {
            errorMessage = 'Content too large for AI embedding service. Try analyzing smaller files or changes.';
            statusCode = 413; // Payload Too Large
        } else {
            errorMessage = error.message; // Use the original error message if more specific
        }
    }
    
    return NextResponse.json({ error: errorMessage, details: error.message, stack: error.stack?.substring(0,1000) }, { status: statusCode });
  }
}

    