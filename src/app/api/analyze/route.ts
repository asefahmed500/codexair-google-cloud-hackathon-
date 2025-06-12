
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPullRequestDetails, getPullRequestFiles, getFileContent, getRepositoryDetails } from '@/lib/github';
import { analyzeCode } from '@/ai/flows/code-quality-analysis'; 
import { PullRequest, Analysis, Repository, connectMongoose } from '@/lib/mongodb';
import type { CodeAnalysisOutput as AIAnalysisOutput, FileAnalysisItem, PullRequest as PRType, CodeFile as CodeFileType } from '@/types';
import { ai } from '@/ai/genkit';

const MAX_FILES_TO_ANALYZE = 10; 
const EMBEDDING_DIMENSIONS = 768;

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
        { githubId: ghRepoDetails.id, userId: session.user.id }, // Query by githubId and userId to ensure uniqueness if user re-adds
        {
          $set: { // Use $set to avoid overwriting existing fields if any partial doc exists
            name: ghRepoDetails.name,
            fullName: ghRepoDetails.full_name,
            owner: ghRepoDetails.owner.login, // Ensure this is 'owner' from request params for consistency
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
    if (!localRepo) { // Should not happen if above logic is correct
        return NextResponse.json({ error: `Repository ${repoFullName} not found locally or could not be synced.` }, { status: 404 });
    }

    // Step 2: Check if PR analysis already exists
    const existingPR = await PullRequest.findOne({
      repositoryId: localRepo._id.toString(), 
      number: pullNumber,
    }).populate('analysis');

    if (existingPR && existingPR.analysis) {
      console.log(`[API/ANALYZE] Analysis already exists for PR #${pullNumber} in ${repoFullName}. Returning existing analysis.`);
      return NextResponse.json({ analysis: existingPR.analysis, pullRequest: existingPR });
    }

    // Step 3: Fetch PR details from GitHub
    console.log(`[API/ANALYZE] Fetching PR details for ${repoFullName} PR #${pullNumber} from GitHub...`);
    const ghPullRequest = await getPullRequestDetails(owner, repoName, pullNumber);
    if (!ghPullRequest) {
      return NextResponse.json({ error: 'Pull request not found on GitHub' }, { status: 404 });
    }

    const ghFiles = await getPullRequestFiles(owner, repoName, pullNumber);
    console.log(`[API/ANALYZE] Found ${ghFiles.length} files in PR. Will consider up to ${MAX_FILES_TO_ANALYZE} for analysis.`);

    const filesToConsider = ghFiles
      .filter(file => 
        (file.status === 'added' || file.status === 'modified' || file.status === 'renamed') &&
        file.filename?.match(/\.(js|ts|jsx|tsx|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i)
      )
      .slice(0, MAX_FILES_TO_ANALYZE);

    // Step 4: Analyze files
    const fileAnalysesPromises = filesToConsider.map(async (file): Promise<FileAnalysisItem | null> => {
        try {
          let contentToAnalyze: string | null = null;
          let analysisContext = "full file"; 

          console.log(`[API/ANALYZE] Preparing to analyze file: ${file.filename}, status: ${file.status}`);

          if (file.status === 'added' || file.status === 'renamed') { // Treat renamed as added for content analysis
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
          } else { // Fallback for unexpected cases or statuses we don't explicitly handle for diffs
            console.warn(`[API/ANALYZE] Unhandled file status or condition for ${file.filename} (status: ${file.status}). Analyzing full content as fallback.`);
            contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
            analysisContext = "full file (general fallback)";
          }
          
          if (!contentToAnalyze || contentToAnalyze.trim() === '') {
            console.warn(`[API/ANALYZE] Could not get valid content for ${file.filename} (status: ${file.status}, context: ${analysisContext}). Skipping its AI analysis and embedding.`);
            return null; 
          }
          
          console.log(`[API/ANALYZE] Analyzing ${file.filename} (context: ${analysisContext}, length: ${contentToAnalyze.length} chars)`);

          if (contentToAnalyze.length > 70000) { 
             console.warn(`[API/ANALYZE] Content for ${file.filename} is too large (${contentToAnalyze.length} chars), truncating to 70000.`);
             contentToAnalyze = contentToAnalyze.substring(0, 70000);
          }

          const aiResponse: AIAnalysisOutput = await analyzeCode({ code: contentToAnalyze, filename: file.filename });
          
          let fileEmbedding: number[] | undefined = undefined;
          // Only generate embedding if contentToAnalyze is valid
          if (contentToAnalyze && contentToAnalyze.trim() !== '') { 
            try {
              const embeddingResult = await ai.generate({
                model: 'googleai/text-embedding-004',
                prompt: contentToAnalyze, // Use the (potentially truncated) content that was analyzed
              });
              
              let rawEmbedding = embeddingResult.output;
              if (rawEmbedding && typeof rawEmbedding === 'object' && 'embedding' in rawEmbedding && Array.isArray(rawEmbedding.embedding)) {
                  fileEmbedding = rawEmbedding.embedding;
              } else if (rawEmbedding && typeof rawEmbedding === 'object' && 'vector' in rawEmbedding && Array.isArray(rawEmbedding.vector)) {
                  fileEmbedding = rawEmbedding.vector; // Some models might use 'vector'
              } else if (Array.isArray(rawEmbedding)) { // Direct array output
                  fileEmbedding = rawEmbedding;
              }

              if (!fileEmbedding || !fileEmbedding.every(n => typeof n === 'number')) {
                 console.warn(`[API/ANALYZE] Unexpected or missing embedding format for ${file.filename}. Output:`, embeddingResult.output);
                 fileEmbedding = undefined;
              } else if (fileEmbedding.length !== EMBEDDING_DIMENSIONS) {
                console.warn(`[API/ANALYZE] Generated embedding for ${file.filename} has ${fileEmbedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Embedding will not be stored.`);
                fileEmbedding = undefined;
              } else {
                console.log(`[API/ANALYZE] Successfully generated embedding for ${file.filename} with ${fileEmbedding.length} dimensions.`);
              }
            } catch (embeddingError: any) {
              console.error(`[API/ANALYZE] Error generating embedding for file ${file.filename}:`, embeddingError.message);
              // Continue without embedding for this file
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
            vectorEmbedding: fileEmbedding,
          };
        } catch (error: any) {
          console.error(`[API/ANALYZE] Error analyzing file ${file.filename}:`, error.message, error.stack);
          // Return null for this file so Promise.all doesn't break, but log the error
          return null; 
        }
      });

    const fileAnalysesResults = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];
    console.log(`[API/ANALYZE] Successfully analyzed ${fileAnalysesResults.length} files.`);

    // Step 5: Aggregate analysis results
    const totalAnalyzedFiles = fileAnalysesResults.length;
    const aggregatedAnalysis: Omit<AIAnalysisOutput, '_id' | 'pullRequestId' | 'createdAt' | 'vectorEmbedding'> & { fileAnalyses?: FileAnalysisItem[] } = {
      qualityScore: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzedFiles : 0,
      complexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzedFiles : 0,
      maintainability: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzedFiles : 0,
      securityIssues: fileAnalysesResults.flatMap(a => a.securityIssues || []),
      suggestions: fileAnalysesResults.flatMap(a => a.suggestions || []),
      metrics: {
        linesOfCode: fileAnalysesResults.reduce((sum, fa) => sum + (fa.metrics?.linesOfCode || 0), 0),
        cyclomaticComplexity: totalAnalyzedFiles > 0 ? parseFloat((fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cyclomaticComplexity || 0), 0) / totalAnalyzedFiles).toFixed(1)) : 0,
        cognitiveComplexity: totalAnalyzedFiles > 0 ? parseFloat((fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cognitiveComplexity || 0), 0) / totalAnalyzedFiles).toFixed(1)) : 0,
        duplicateBlocks: fileAnalysesResults.reduce((sum, fa) => sum + (fa.metrics?.duplicateBlocks || 0), 0),
      },
      aiInsights: fileAnalysesResults.map(a => `File: ${a.filename} (Analyzed Lines: ${a.metrics?.linesOfCode || 'N/A'} from ${a.metrics?.linesOfCode ? analysisContext : 'N/A'}):\n${a.aiInsights}`).join('\n\n---\n\n') || 'No AI insights generated for individual files.',
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

    let savedPR = existingPR; // Use existingPR if found earlier (without analysis)
    if (!savedPR) {
      savedPR = new PullRequest({
        repositoryId: localRepo._id.toString(), 
        owner: owner, // Store owner from request params
        repoName: repoName, // Store repoName from request params
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
        userId: session.user.id,
        createdAt: new Date(ghPullRequest.created_at), 
        updatedAt: new Date(ghPullRequest.updated_at),
      });
    } else {
      // Update existing PR details if it was already in DB but without analysis
      savedPR.title = ghPullRequest.title;
      savedPR.body = ghPullRequest.body || '';
      savedPR.state = ghPullRequest.state as PRType['state'];
      savedPR.files = prFiles; 
      savedPR.owner = owner; // Ensure owner/repoName are updated
      savedPR.repoName = repoName;
      savedPR.author = { // Update author info
          login: ghPullRequest.user?.login || savedPR.author?.login || 'unknown',
          avatar: ghPullRequest.user?.avatar_url || savedPR.author?.avatar || '',
      };
      savedPR.updatedAt = new Date(ghPullRequest.updated_at);
    }
    await savedPR.save();
    console.log(`[API/ANALYZE] Saved/Updated PullRequest ${savedPR._id} for ${repoFullName} PR #${pullNumber}`);

    const analysisDoc = new Analysis({
      pullRequestId: savedPR._id,
      ...aggregatedAnalysis,
    });
    await analysisDoc.save();
    console.log(`[API/ANALYZE] Saved Analysis ${analysisDoc._id} for PR ${savedPR._id}`);

    savedPR.analysis = analysisDoc._id;
    await savedPR.save();

    // Populate analysis for the response
    const populatedPR = await PullRequest.findById(savedPR._id).populate('analysis').lean();

    return NextResponse.json({ analysis: analysisDoc.toObject(), pullRequest: populatedPR });

  } catch (error: any) {
    console.error('[API/ANALYZE] Critical error during pull request analysis:', error, error.stack);
    
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

