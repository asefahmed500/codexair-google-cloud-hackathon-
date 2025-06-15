
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPullRequestDetails, getPullRequestFiles, getFileContent, getRepositoryDetails } from '@/lib/github';
import { analyzeCode } from '@/ai/flows/code-quality-analysis'; 
import { summarizePrAnalysis } from '@/ai/flows/summarize-pr-analysis-flow'; // Import new flow
import { PullRequest, Analysis, Repository, connectMongoose } from '@/lib/mongodb';
import type { CodeAnalysisOutput as AIAnalysisOutput, FileAnalysisItem, PullRequest as PRType, CodeFile as CodeFileType } from '@/types';
import { ai } from '@/ai/genkit';

const MAX_FILES_TO_ANALYZE = 10; 
const EMBEDDING_DIMENSIONS = 768;
const FALLBACK_SUMMARY_MESSAGE = "Overall analysis summary could not be generated for this pull request.";


/**
 * Extracts added lines from a git patch string.
 * @param patch The patch string.
 * @returns A string containing only the added lines, or an empty string if no added lines are found.
 */
function extractAddedLinesFromPatch(patch?: string): string {
  if (!patch) return '';
  const lines = patch.split('\n');
  const addedLines: string[] = [];
  for (const line of lines) {
    // Line is an addition if it starts with '+' but not '+++' (which is a diff header)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.substring(1)); // Remove the leading '+'
    }
  }
  return addedLines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { owner, repoName, pullNumber: pullNumberStr } = await request.json();
    const pullNumber = parseInt(pullNumberStr);

    if (!owner || !repoName || isNaN(pullNumber)) {
      return NextResponse.json({ error: 'Missing owner, repoName, or pullNumber' }, { status: 400 });
    }
    
    const repoFullName = `${owner}/${repoName}`;
    console.log(`[API/ANALYZE] Initiating analysis for ${repoFullName} PR #${pullNumber} by user ${session.user.id}`);

    // Step 1: Ensure Repository exists locally or sync it
    let localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
      console.log(`[API/ANALYZE] Repository ${repoFullName} not found locally for user ${session.user.id}. Fetching from GitHub...`);
      const ghRepoDetails = await getRepositoryDetails(owner, repoName);
      if (!ghRepoDetails) {
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
    }
    if (!localRepo) { 
        return NextResponse.json({ error: `Repository ${repoFullName} not found locally or could not be synced.` }, { status: 404 });
    }

    // Step 2: Check if PR analysis already exists
    // For re-analysis, one might allow overwriting, but for now, if analysis exists, we return it.
    // However, the request is to analyze, so we should proceed.
    // We will update the existing PR document's analysis field later.
    // Update PR analysisStatus to 'pending' immediately
     await PullRequest.updateOne(
        { repositoryId: localRepo._id.toString(), number: pullNumber },
        { $set: { analysisStatus: 'pending' } },
        { upsert: true } // Upsert to create if PR doc doesn't exist yet for some reason
    );
    console.log(`[API/ANALYZE] Set PR #${pullNumber} status to 'pending' for ${repoFullName}.`);


    // Step 3: Fetch PR details from GitHub
    console.log(`[API/ANALYZE] Fetching PR details for ${repoFullName} PR #${pullNumber} from GitHub...`);
    const ghPullRequest = await getPullRequestDetails(owner, repoName, pullNumber);
    if (!ghPullRequest) {
      await PullRequest.updateOne(
        { repositoryId: localRepo._id.toString(), number: pullNumber },
        { $set: { analysisStatus: 'failed' } }
      );
      return NextResponse.json({ error: 'Pull request not found on GitHub' }, { status: 404 });
    }

    const ghFiles = await getPullRequestFiles(owner, repoName, pullNumber);
    console.log(`[API/ANALYZE] Found ${ghFiles.length} files in PR. Will consider up to ${MAX_FILES_TO_ANALYZE} for analysis.`);

    const filesToConsider = ghFiles
      .filter(file => 
        (file.status === 'added' || file.status === 'modified' || file.status === 'renamed') &&
        file.filename?.match(/\.(js|ts|jsx|tsx|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i) &&
        (file.changes || 0) < 2000 // Filter out extremely large diffs for individual file content fetching (safety)
      )
      .slice(0, MAX_FILES_TO_ANALYZE);

    // Step 4: Analyze files
    const fileAnalysesPromises = filesToConsider.map(async (file): Promise<FileAnalysisItem | null> => {
        let analysisContext = "full file"; // Default context
        try {
          let contentToAnalyze: string | null = null;
          
          console.log(`[API/ANALYZE] Preparing to analyze file: ${file.filename}, status: ${file.status}`);

          if (file.status === 'added' || file.status === 'renamed') { 
            contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
            analysisContext = file.status === 'added' ? "full file (added)" : "full file (renamed)";
          } else if (file.status === 'modified' && file.patch) {
            const addedLines = extractAddedLinesFromPatch(file.patch);
            if (addedLines.trim() !== '') {
              contentToAnalyze = addedLines;
              analysisContext = "diff (added lines)";
            } else {
              console.warn(`[API/ANALYZE] Patch for modified file ${file.filename} yielded no added lines. Analyzing full content as fallback.`);
              contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
              analysisContext = "full file (fallback from diff)";
            }
          } else { 
            console.warn(`[API/ANALYZE] Unhandled file status or condition for ${file.filename} (status: ${file.status}). Analyzing full content as fallback.`);
            contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
            analysisContext = "full file (general fallback)";
          }
          
          if (!contentToAnalyze || contentToAnalyze.trim() === '') {
            console.warn(`[API/ANALYZE] Could not get valid content for ${file.filename} (status: ${file.status}, context: ${analysisContext}). Skipping its AI analysis and embedding.`);
            return null; 
          }
          
          console.log(`[API/ANALYZE] Analyzing ${file.filename} (context: ${analysisContext}, length: ${contentToAnalyze.length} chars)`);

          const MAX_CONTENT_LENGTH_FOR_ANALYSIS = 70000; // Max chars for AI model
          if (contentToAnalyze.length > MAX_CONTENT_LENGTH_FOR_ANALYSIS) { 
             console.warn(`[API/ANALYZE] Content for ${file.filename} is too large (${contentToAnalyze.length} chars), truncating to ${MAX_CONTENT_LENGTH_FOR_ANALYSIS}.`);
             contentToAnalyze = contentToAnalyze.substring(0, MAX_CONTENT_LENGTH_FOR_ANALYSIS);
          }

          const aiResponse: AIAnalysisOutput = await analyzeCode({ code: contentToAnalyze, filename: file.filename });
          
          let fileEmbeddingVector: number[] | undefined = undefined;
          if (contentToAnalyze && contentToAnalyze.trim() !== '') { 
            try {
              const { embedding } = await ai.embed({
                embedder: 'googleai/text-embedding-004',
                content: contentToAnalyze,
              });
              
              if (embedding && Array.isArray(embedding) && embedding.every(n => typeof n === 'number')) {
                fileEmbeddingVector = embedding;

                if (fileEmbeddingVector.length !== EMBEDDING_DIMENSIONS) {
                  console.warn(`[API/ANALYZE] Generated embedding for ${file.filename} has ${fileEmbeddingVector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Embedding will not be stored.`);
                  fileEmbeddingVector = undefined;
                } else {
                  console.log(`[API/ANALYZE] Successfully generated embedding for ${file.filename} with ${fileEmbeddingVector.length} dimensions.`);
                }
              } else {
                 console.warn(`[API/ANALYZE] ai.embed returned an invalid embedding for ${file.filename}. Embedding:`, embedding);
                 fileEmbeddingVector = undefined;
              }
            } catch (embeddingError: any) {
              console.error(`[API/ANALYZE] Error generating embedding for file ${file.filename}:`, embeddingError.message);
              fileEmbeddingVector = undefined; 
            }
          } else {
            console.log(`[API/ANALYZE] Skipping embedding for ${file.filename} due to empty or invalid content.`);
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
          console.error(`[API/ANALYZE] Error analyzing file ${file.filename}:`, error.message, error.stack);
          return null; 
        }
      });

    const fileAnalysesResults = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];
    console.log(`[API/ANALYZE] Successfully analyzed ${fileAnalysesResults.length} files.`);

    // Step 5: Aggregate analysis results for overall metrics
    const totalAnalyzedFiles = fileAnalysesResults.length;
    const aggregatedQualityScore = totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzedFiles : 0;
    const aggregatedComplexity = totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzedFiles : 0;
    const aggregatedMaintainability = totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzedFiles : 0;
    const allSecurityIssues = fileAnalysesResults.flatMap(a => a.securityIssues || []);
    const allSuggestions = fileAnalysesResults.flatMap(a => a.suggestions || []);
    
    const totalCriticalIssues = allSecurityIssues.filter(s => s.severity === 'critical').length;
    const totalHighIssues = allSecurityIssues.filter(s => s.severity === 'high').length;

    // Step 5.5: Generate PR-level summary using the new flow
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
            const summaryOutput = await summarizePrAnalysis(summaryInput);
            prLevelSummary = summaryOutput.prSummary;
            console.log(`[API/ANALYZE] Generated PR-level summary for PR #${pullNumber}.`);
        } catch (summaryError: any) {
            console.error(`[API/ANALYZE] Error generating PR-level summary for PR #${pullNumber}:`, summaryError.message);
        }
    }


    const finalAnalysisData = {
      pullRequestId: '', // This will be set after PR is saved/found
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
    };
    
    // Step 6: Save PullRequest and Analysis to DB
    const prFiles: CodeFileType[] = ghFiles.map(f => ({
        filename: f.filename,
        status: f.status as CodeFileType['status'],
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch || '',
      }));

    let savedPR = await PullRequest.findOne({
      repositoryId: localRepo._id.toString(),
      number: pullNumber,
    });

    if (!savedPR) {
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
        userId: session.user.id, // User who initiated this sync/analysis for this PR
        createdAt: new Date(ghPullRequest.created_at), 
        updatedAt: new Date(ghPullRequest.updated_at),
        analysisStatus: 'pending', // Initially pending
      });
    } else {
      savedPR.title = ghPullRequest.title;
      savedPR.body = ghPullRequest.body || '';
      savedPR.state = ghPullRequest.state as PRType['state'];
      savedPR.files = prFiles; 
      savedPR.owner = owner; 
      savedPR.repoName = repoName;
      savedPR.author = { 
          login: ghPullRequest.user?.login || savedPR.author?.login || 'unknown',
          avatar: ghPullRequest.user?.avatar_url || savedPR.author?.avatar || '',
      };
      savedPR.updatedAt = new Date(ghPullRequest.updated_at);
      savedPR.userId = savedPR.userId || session.user.id; // Ensure userId is set if it was missing
    }
    await savedPR.save();
    console.log(`[API/ANALYZE] Saved/Updated PullRequest ${savedPR._id} for ${repoFullName} PR #${pullNumber}`);

    finalAnalysisData.pullRequestId = savedPR._id.toString();

    // Remove old analysis if it exists for this PR
    if (savedPR.analysis) {
        await Analysis.deleteOne({ _id: savedPR.analysis });
        console.log(`[API/ANALYZE] Deleted old analysis for PR ${savedPR._id}`);
    }
    
    const analysisDoc = new Analysis(finalAnalysisData);
    await analysisDoc.save();
    console.log(`[API/ANALYZE] Saved Analysis ${analysisDoc._id} for PR ${savedPR._id}`);

    savedPR.analysis = analysisDoc._id;
    savedPR.analysisStatus = 'analyzed';
    savedPR.qualityScore = aggregatedQualityScore;
    await savedPR.save();

    const populatedPR = await PullRequest.findById(savedPR._id).populate('analysis').lean();

    return NextResponse.json({ analysis: analysisDoc.toObject(), pullRequest: populatedPR });

  } catch (error: any) {
    console.error('[API/ANALYZE] Critical error during pull request analysis:', error, error.stack);
    
    const { owner, repoName, pullNumber: pullNumberStr } = await request.json(); // Re-parse for logging
    const pullNumber = parseInt(pullNumberStr);

    if (owner && repoName && !isNaN(pullNumber)) {
        try {
            await PullRequest.updateOne(
                { owner, repoName, number: pullNumber, userId: (await getServerSession(authOptions))?.user?.id },
                { $set: { analysisStatus: 'failed' } }
            );
             console.log(`[API/ANALYZE] Set PR #${pullNumber} status to 'failed' due to error.`);
        } catch (dbError) {
            console.error(`[API/ANALYZE] Failed to update PR status to 'failed' in DB:`, dbError);
        }
    }

    let errorMessage = 'Internal server error during analysis';
    let statusCode = 500;

    if (error.message.includes('GitHub API error') || error.status && (error.status === 401 || error.status === 403 || error.status === 404)) {
        errorMessage = `GitHub API error: ${error.message}`;
        statusCode = error.status || 500;
    } else if (error.message.toLowerCase().includes('genkit') || error.message.toLowerCase().includes('ai model')) {
        errorMessage = `AI processing error: ${error.message}`;
    }
    
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: statusCode });
  }
}
