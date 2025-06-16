
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Repository, RepositoryScan, connectMongoose } from '@/lib/mongodb';
import { getDefaultBranch, getRepoFileTree, getFileContent, getGithubClient } from '@/lib/github';
import { analyzeCode } from '@/ai/flows/code-quality-analysis';
import { summarizePrAnalysis } from '@/ai/flows/summarize-pr-analysis-flow';
import type { FileAnalysisItem, SecurityIssue, Suggestion, CodeAnalysisMetrics, RepositoryScanResult } from '@/types';
import { ai } from '@/ai/genkit';
import mongoose from 'mongoose';

const MAX_FILES_TO_SCAN = 5;
const MAX_CONTENT_LENGTH_FOR_ANALYSIS = 20000; 
const EMBEDDING_DIMENSIONS = 768;
const FALLBACK_SUMMARY_MESSAGE = "Overall repository scan summary could not be generated.";

const RELEVANT_FILE_EXTENSIONS = /\.(js|ts|jsx|tsx|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i;
const EXCLUDED_FILE_PATTERNS_FOR_SCAN = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.min\.(js|css)$/, // Minified files
    /\.(map)$/, // Source maps
    /\.(lock)$/, // Generic lock files
    /node_modules\//, // Node modules folder
    /\.git\//, // Git folder
    /dist\//, // Common build output folders
    /build\//,
    /out\//,
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|eot|ttf|otf)$/i // Common binary/font files
];


async function generateOverallSummary(
  repoFullName: string, 
  branchName: string,
  aggregatedQualityScore: number,
  totalCriticalIssues: number,
  totalHighIssues: number,
  allSuggestionsCount: number,
  analyzedFileCount: number,
  perFileSummaries: { filename: string; insight: string }[]
): Promise<string> {
  try {
    console.log(`[API/RepoScan] Generating overall summary for ${repoFullName}, branch ${branchName}. Files analyzed: ${analyzedFileCount}.`);
    if (analyzedFileCount === 0) {
        console.log(`[API/RepoScan] No files were analyzed, returning fallback summary for ${repoFullName}.`);
        return FALLBACK_SUMMARY_MESSAGE;
    }
    const promptContext = {
      prTitle: `${repoFullName} (Full Scan - ${branchName} branch)`, 
      overallQualityScore: aggregatedQualityScore,
      totalCriticalIssues: totalCriticalIssues,
      totalHighIssues: totalHighIssues,
      totalSuggestions: allSuggestionsCount,
      fileCount: analyzedFileCount,
      perFileSummaries: perFileSummaries,
    };
    const summaryOutput = await summarizePrAnalysis(promptContext);
    console.log(`[API/RepoScan] Overall summary generated for ${repoFullName}. Length: ${summaryOutput.prSummary?.length || 0}`);
    return summaryOutput.prSummary || FALLBACK_SUMMARY_MESSAGE;
  } catch (error: any) {
    console.error(`[API/RepoScan] Error generating repository scan summary for ${repoFullName}:`, error.message, error.stack);
    return FALLBACK_SUMMARY_MESSAGE;
  }
}

export async function POST(request: NextRequest) {
  let owner: string | undefined, repoName: string | undefined;
  let sessionUserIdForCatch: string | undefined; 

  try {
    console.log('[API/RepoScan] Received repository scan request.');
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('[API/RepoScan] Unauthorized: No session user ID.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    sessionUserIdForCatch = session.user.id;
    console.log(`[API/RepoScan] Authenticated user: ${session.user.id}`);

    await connectMongoose();
    console.log('[API/RepoScan] Connected to Mongoose.');

    const reqBody = await request.json();
    owner = reqBody.owner;
    repoName = reqBody.repoName;

    if (!owner || !repoName) {
      console.error('[API/RepoScan] Invalid input:', { owner, repoName });
      return NextResponse.json({ error: 'Missing owner or repoName' }, { status: 400 });
    }
    const repoFullName = `${owner}/${repoName}`;
    console.log(`[API/RepoScan] Initiating scan for ${repoFullName} by user ${session.user.id}`);


    const localRepo = await Repository.findOne({ owner, name: repoName, userId: session.user.id });
    if (!localRepo) {
      console.error(`[API/RepoScan] Repository ${repoFullName} not found or not synced by user ${session.user.id}.`);
      return NextResponse.json({ error: 'Repository not found or not synced by user' }, { status: 404 });
    }
    console.log(`[API/RepoScan] Found local repository ${localRepo.fullName} (ID: ${localRepo._id})`);

    const defaultBranch = await getDefaultBranch(owner, repoName);
    if (!defaultBranch) {
      console.error(`[API/RepoScan] Could not determine default branch for ${repoFullName}.`);
      return NextResponse.json({ error: 'Could not determine default branch for repository' }, { status: 500 });
    }
    console.log(`[API/RepoScan] Default branch for ${repoFullName} is ${defaultBranch}.`);

    let headCommitSha: string;
    try {
      const octokit = await getGithubClient();
      const branchData = await octokit.rest.repos.getBranch({ owner, repo: repoName, branch: defaultBranch });
      headCommitSha = branchData.data.commit.sha;
      if (!headCommitSha) {
        throw new Error(`Could not retrieve valid commit SHA for branch ${defaultBranch}`);
      }
      console.log(`[API/RepoScan] Head commit SHA for ${defaultBranch} is ${headCommitSha}.`);
    } catch (e: any) {
      console.error(`[API/RepoScan POST] Error fetching head commit SHA for branch ${defaultBranch} of ${repoFullName}:`, e.message);
      return NextResponse.json({ error: `Failed to get branch details for ${defaultBranch}. Ensure the branch exists and the app has access.`, details: e.message }, { status: 500 });
    }

    const fileTree = await getRepoFileTree(owner, repoName, headCommitSha);
    if (!fileTree || fileTree.length === 0) {
        console.warn(`[API/RepoScan] File tree for ${repoFullName} at commit ${headCommitSha} is empty or could not be fetched.`);
    }
    const relevantFiles = fileTree
      .filter(file => 
        file.type === 'blob' && 
        file.path && 
        RELEVANT_FILE_EXTENSIONS.test(file.path) &&
        !EXCLUDED_FILE_PATTERNS_FOR_SCAN.some(pattern => pattern.test(file.path!)) &&
        file.path 
      )
      .slice(0, MAX_FILES_TO_SCAN);

    console.log(`[API/RepoScan] Found ${relevantFiles.length} relevant files (limited to ${MAX_FILES_TO_SCAN}) for ${repoFullName} at commit ${headCommitSha}.`);

    if (relevantFiles.length === 0) {
        console.warn(`[API/RepoScan] No relevant files found to analyze for ${repoFullName} after filtering. Scan will result in empty analysis.`);
    }

    const fileAnalysesPromises = relevantFiles.map(async (fileMeta): Promise<FileAnalysisItem | null> => {
      let contentToAnalyze: string | null = null;
      console.log(`[API/RepoScan] Processing file: ${fileMeta.path!}`);
      try {
        contentToAnalyze = await getFileContent(owner!, repoName!, fileMeta.path!, headCommitSha);
        if (!contentToAnalyze || contentToAnalyze.trim() === '') {
          console.warn(`[API/RepoScan] No content or empty content for file ${fileMeta.path!}. Skipping analysis and embedding.`);
          return null;
        }
        if (contentToAnalyze.length > MAX_CONTENT_LENGTH_FOR_ANALYSIS) {
          console.warn(`[API/RepoScan] Content for ${fileMeta.path!} too long (${contentToAnalyze.length} chars), truncating to ${MAX_CONTENT_LENGTH_FOR_ANALYSIS}.`);
          contentToAnalyze = contentToAnalyze.substring(0, MAX_CONTENT_LENGTH_FOR_ANALYSIS);
        }
        
        console.log(`[API/RepoScan] Calling analyzeCode for ${fileMeta.path!} (length: ${contentToAnalyze.length} chars)`);
        const aiResponse = await analyzeCode({ code: contentToAnalyze, filename: fileMeta.path! });
        console.log(`[API/RepoScan] analyzeCode completed for ${fileMeta.path!}. Quality: ${aiResponse.qualityScore}`);


        let fileEmbeddingVector: number[] | undefined = undefined;
        if (contentToAnalyze && contentToAnalyze.trim() !== "") {
          try {
            console.log(`[API/RepoScan] Generating embedding for ${fileMeta.path!}...`);
            const embedApiResponse = await ai.embed({
              embedder: 'googleai/text-embedding-004',
              content: contentToAnalyze,
            });
            
            let extractedEmbedding: number[] | undefined = undefined;
            // Handle case where response is an array with the embedding object inside
            if (Array.isArray(embedApiResponse) &&
                embedApiResponse.length > 0 &&
                embedApiResponse[0] &&
                typeof embedApiResponse[0] === 'object' &&
                embedApiResponse[0] !== null &&
                Object.prototype.hasOwnProperty.call(embedApiResponse[0], 'embedding')) {
                
                const potentialEmbedding = (embedApiResponse[0] as any).embedding;
                if (Array.isArray(potentialEmbedding) &&
                    potentialEmbedding.length > 0 && 
                    potentialEmbedding.every(n => typeof n === 'number' && isFinite(n))) {
                    extractedEmbedding = potentialEmbedding;
                }
            } 
            // Handle case where response is the embedding object directly
            else if (embedApiResponse && typeof embedApiResponse === 'object' && Object.prototype.hasOwnProperty.call(embedApiResponse, 'embedding')) {
                const potentialEmbedding = (embedApiResponse as any).embedding;
                if (Array.isArray(potentialEmbedding) &&
                    potentialEmbedding.length > 0 &&
                    potentialEmbedding.every(n => typeof n === 'number' && isFinite(n))) {
                    extractedEmbedding = potentialEmbedding;
                }
            }

            if (extractedEmbedding && extractedEmbedding.length === EMBEDDING_DIMENSIONS) {
              fileEmbeddingVector = extractedEmbedding;
              console.log(`[API/RepoScan] Embedding success for ${fileMeta.path!} (${fileEmbeddingVector.length} dims).`);
            } else {
              console.warn(`[API/RepoScan] Embedding for ${fileMeta.path!} invalid or wrong dimensions. Expected ${EMBEDDING_DIMENSIONS}, got ${extractedEmbedding?.length}. Resp snippet:`, JSON.stringify(embedApiResponse).substring(0,200));
            }
          } catch (embErr: any) {
            console.error(`[API/RepoScan] Embedding error for ${fileMeta.path!}: ${embErr.message}. Content length: ${contentToAnalyze.length}. Error details:`, embErr);
          }
        } else {
           console.log(`[API/RepoScan] Skipping embedding for ${fileMeta.path!} (empty/whitespace content).`);
        }

        return {
          filename: fileMeta.path!,
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
        console.error(`[API/RepoScan] CRITICAL Error processing file ${fileMeta.path!}:`, error.message, error.stack);
        return null; 
      }
    });

    const analyzedFiles = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];
    console.log(`[API/RepoScan] Successfully analyzed ${analyzedFiles.length} out of ${relevantFiles.length} considered files for ${repoFullName}.`);

    if (analyzedFiles.length === 0 && relevantFiles.length > 0) {
        console.warn(`[API/RepoScan] No files were successfully analyzed with AI for ${repoFullName}, though ${relevantFiles.length} were considered. Check logs for file-specific errors.`);
    }

    const totalAnalyzed = analyzedFiles.length;
    const aggQuality = totalAnalyzed > 0 ? analyzedFiles.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzed : 0;
    const aggComplexity = totalAnalyzed > 0 ? analyzedFiles.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzed : 0;
    const aggMaintainability = totalAnalyzed > 0 ? analyzedFiles.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzed : 0;
    const allSecIssues = analyzedFiles.flatMap(a => a.securityIssues || []);
    const allSugs = analyzedFiles.flatMap(a => a.suggestions || []);
    const aggMetrics: CodeAnalysisMetrics = {
      linesOfCode: analyzedFiles.reduce((sum, a) => sum + (a.metrics?.linesOfCode || 0), 0),
      cyclomaticComplexity: totalAnalyzed > 0 ? parseFloat((analyzedFiles.reduce((sum, a) => sum + (a.metrics?.cyclomaticComplexity || 0), 0) / totalAnalyzed).toFixed(1)) : 0,
      cognitiveComplexity: totalAnalyzed > 0 ? parseFloat((analyzedFiles.reduce((sum, a) => sum + (a.metrics?.cognitiveComplexity || 0), 0) / totalAnalyzed).toFixed(1)) : 0,
      duplicateBlocks: analyzedFiles.reduce((sum, a) => sum + (a.metrics?.duplicateBlocks || 0), 0),
    };
    console.log(`[API/RepoScan] Aggregated scores for ${repoFullName}: Q=${aggQuality.toFixed(1)}, C=${aggComplexity.toFixed(1)}, M=${aggMaintainability.toFixed(1)}`);


    const overallSummary = await generateOverallSummary(
        repoFullName, 
        defaultBranch,
        aggQuality,
        allSecIssues.filter(s => s.severity === 'critical').length,
        allSecIssues.filter(s => s.severity === 'high').length,
        allSugs.length,
        totalAnalyzed,
        analyzedFiles.map(fa => ({ filename: fa.filename, insight: fa.aiInsights }))
    );

    const newScanData: Omit<RepositoryScanResult, '_id' | 'updatedAt'> = {
      repositoryId: new mongoose.Types.ObjectId(localRepo._id as string),
      userId: session.user.id,
      owner: owner!, 
      repoName: repoName!, 
      branchAnalyzed: defaultBranch,
      commitShaAnalyzed: headCommitSha,
      status: 'completed',
      qualityScore: aggQuality,
      complexity: aggComplexity,
      maintainability: aggMaintainability,
      securityIssues: allSecIssues,
      suggestions: allSugs,
      metrics: aggMetrics,
      summaryAiInsights: overallSummary,
      fileAnalyses: analyzedFiles,
      createdAt: new Date(),
    };
    
    console.log(`[API/RepoScan] Final repository scan data before saving (summary: "${newScanData.summaryAiInsights.substring(0,100)}..."):`, JSON.stringify(newScanData, (key, value) => key === 'vectorEmbedding' ? `[${value?.length || 0} numbers]` : value, 2).substring(0, 1000) + "...");
    const newScan = new RepositoryScan(newScanData);
    await newScan.save();
    console.log(`[API/RepoScan] SUCCESSFULLY Saved RepositoryScan document ID: ${newScan._id} for ${repoFullName}.`);

    return NextResponse.json({ scanId: newScan._id.toString() });

  } catch (error: any) {
    console.error(`[API/RepoScan] CRITICAL ERROR during repository scan for ${owner ?? 'unknown_owner'}/${repoName ?? 'unknown_repo'}. User: ${sessionUserIdForCatch ?? 'unknown_user'}. Error:`, error.message, error.stack);
    if (!(error instanceof Error)) {
      console.error('[API/RepoScan] Full error object (non-Error instance):', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
    
    let clientMessage = 'Failed to initiate repository scan.';
    let detailsForClient = error instanceof Error ? error.message : 'An unexpected error occurred.';
    let statusCode = 500;
    
    if (detailsForClient.toLowerCase().includes('fetch failed') || detailsForClient.toLowerCase().includes('econnrefused') || detailsForClient.toLowerCase().includes('socket hang up')) {
        clientMessage = "Network error: Could not connect to a required backend service (e.g., AI model server or Genkit development server). Please ensure all backend services are running correctly.";
        detailsForClient = clientMessage;
    } else if (detailsForClient.includes("Could not retrieve valid commit SHA for branch") || detailsForClient.includes("Failed to get branch details")) {
        clientMessage = "Configuration Error: Could not get essential repository information (e.g., commit SHA for default branch). Please ensure the repository is accessible and the default branch exists.";
    } else if (detailsForClient.includes('payload size exceeds the limit')) {
        clientMessage = 'Content too large for AI embedding service. One or more files exceeded the size limit.';
        statusCode = 413; 
    } else if (error.message) {
        clientMessage = error.message;
    }
    
    let detailsForServerLog = 'No further details available.';
    if (error instanceof Error && error.stack) {
        detailsForServerLog = error.stack;
    } else if (typeof error === 'string') {
        detailsForServerLog = error;
    } else if ((error as any).details) {
        detailsForServerLog = String((error as any).details);
    } else {
        try {
            detailsForServerLog = JSON.stringify(error);
        } catch (e) {
            detailsForServerLog = "Could not stringify error object for server log."
        }
    }
    console.error('[API/RepoScan POST] Server Log Details (first 1000 chars):', detailsForServerLog.substring(0,1000));

    return NextResponse.json({
        error: clientMessage,
        details: detailsForClient.substring(0, 500), 
        stack: process.env.NODE_ENV === 'development' && error.stack ? error.stack.substring(0,1000) : undefined 
    }, { status: statusCode });
  }
}

    
