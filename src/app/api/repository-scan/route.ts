
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
const MAX_CONTENT_LENGTH_FOR_ANALYSIS = 70000;
const EMBEDDING_DIMENSIONS = 768;
const FALLBACK_SUMMARY_MESSAGE = "Overall repository scan summary could not be generated.";

const RELEVANT_FILE_EXTENSIONS = /\.(js|ts|jsx|tsx|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i;

async function generateOverallSummary(
  repoName: string,
  branchName: string,
  aggregatedQualityScore: number,
  totalCriticalIssues: number,
  totalHighIssues: number,
  allSuggestionsCount: number,
  analyzedFileCount: number,
  perFileSummaries: { filename: string; insight: string }[]
): Promise<string> {
  try {
    const summaryInput = {
      prTitle: `${repoName} (Full Scan - ${branchName} branch)`,
      overallQualityScore: aggregatedQualityScore,
      totalCriticalIssues: totalCriticalIssues,
      totalHighIssues: totalHighIssues,
      totalSuggestions: allSuggestionsCount,
      fileCount: analyzedFileCount,
      perFileSummaries: perFileSummaries,
    };
    // Using summarizePrAnalysis flow, context adapted by prTitle.
    const summaryOutput = await summarizePrAnalysis(summaryInput);
    return summaryOutput.prSummary || FALLBACK_SUMMARY_MESSAGE;
  } catch (error) {
    console.error("Error generating repository scan summary:", error);
    return FALLBACK_SUMMARY_MESSAGE;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoose();

    const { owner, repoName } = await request.json();
    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Missing owner or repoName' }, { status: 400 });
    }

    const localRepo = await Repository.findOne({ owner, name: repoName, userId: session.user.id });
    if (!localRepo) {
      return NextResponse.json({ error: 'Repository not found or not synced by user' }, { status: 404 });
    }

    const defaultBranch = await getDefaultBranch(owner, repoName);
    if (!defaultBranch) {
      return NextResponse.json({ error: 'Could not determine default branch for repository' }, { status: 500 });
    }

    let headCommitSha: string;
    try {
      const octokit = await getGithubClient();
      const branchData = await octokit.rest.repos.getBranch({ owner, repo: repoName, branch: defaultBranch });
      headCommitSha = branchData.data.commit.sha;
      if (!headCommitSha) {
        throw new Error(`Could not retrieve valid commit SHA for branch ${defaultBranch}`);
      }
    } catch (e: any) {
      console.error(`[API/RepoScan POST] Error fetching head commit SHA for branch ${defaultBranch} of ${owner}/${repoName}:`, e.message);
      return NextResponse.json({ error: `Failed to get branch details for ${defaultBranch}. Ensure the branch exists and the app has access.`, details: e.message }, { status: 500 });
    }

    const fileTree = await getRepoFileTree(owner, repoName, headCommitSha);
    const relevantFiles = fileTree
      .filter(file => file.type === 'blob' && file.path && RELEVANT_FILE_EXTENSIONS.test(file.path))
      .slice(0, MAX_FILES_TO_SCAN);

    console.log(`[API/RepoScan] Starting scan for ${owner}/${repoName}, branch: ${defaultBranch}. Found ${relevantFiles.length} relevant files (limited to ${MAX_FILES_TO_SCAN}).`);

    const fileAnalysesPromises = relevantFiles.map(async (fileMeta): Promise<FileAnalysisItem | null> => {
      try {
        let contentToAnalyze = await getFileContent(owner, repoName, fileMeta.path!, headCommitSha);
        if (!contentToAnalyze || contentToAnalyze.trim() === '') {
          console.warn(`[API/RepoScan] No content for ${fileMeta.path}. Skipping.`);
          return null;
        }
        if (contentToAnalyze.length > MAX_CONTENT_LENGTH_FOR_ANALYSIS) {
          console.warn(`[API/RepoScan] Content for ${fileMeta.path} too long (${contentToAnalyze.length} chars), truncating to ${MAX_CONTENT_LENGTH_FOR_ANALYSIS}.`);
          contentToAnalyze = contentToAnalyze.substring(0, MAX_CONTENT_LENGTH_FOR_ANALYSIS);
        }

        const aiResponse = await analyzeCode({ code: contentToAnalyze, filename: fileMeta.path! });

        let fileEmbeddingVector: number[] | undefined = undefined;
        if (contentToAnalyze && contentToAnalyze.trim() !== '') {
          try {
            const embedApiResponse = await ai.embed({
              embedder: 'googleai/text-embedding-004',
              content: contentToAnalyze,
            });

            if (Array.isArray(embedApiResponse) && embedApiResponse.length > 0 && embedApiResponse[0]?.embedding) {
              const potentialEmbedding = embedApiResponse[0].embedding;
              if (Array.isArray(potentialEmbedding) && potentialEmbedding.length === EMBEDDING_DIMENSIONS && potentialEmbedding.every(n => typeof n === 'number' && isFinite(n))) {
                fileEmbeddingVector = potentialEmbedding;
              } else {
                console.warn(`[API/RepoScan] Generated embedding for ${fileMeta.path!} is invalid or has incorrect dimensions. Expected ${EMBEDDING_DIMENSIONS}, got ${potentialEmbedding?.length}.`);
              }
            } else {
               console.warn(`[API/RepoScan] ai.embed returned an unexpected structure for ${fileMeta.path!}. Response:`, JSON.stringify(embedApiResponse));
            }
          } catch (embErr: any) {
            console.error(`[API/RepoScan] Embedding error for ${fileMeta.path!}: ${embErr.message}`);
          }
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
        console.error(`[API/RepoScan] Error analyzing file ${fileMeta.path}: ${error.message}`);
        return null;
      }
    });

    const analyzedFiles = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];

    const totalAnalyzed = analyzedFiles.length;
    const aggQuality = totalAnalyzed > 0 ? analyzedFiles.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzed : 0;
    const aggComplexity = totalAnalyzed > 0 ? analyzedFiles.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzed : 0;
    const aggMaintainability = totalAnalyzed > 0 ? analyzedFiles.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzed : 0;
    const allSecIssues = analyzedFiles.flatMap(a => a.securityIssues);
    const allSugs = analyzedFiles.flatMap(a => a.suggestions);
    const aggMetrics: CodeAnalysisMetrics = {
      linesOfCode: analyzedFiles.reduce((sum, a) => sum + (a.metrics?.linesOfCode || 0), 0),
      cyclomaticComplexity: totalAnalyzed > 0 ? parseFloat((analyzedFiles.reduce((sum, a) => sum + (a.metrics?.cyclomaticComplexity || 0), 0) / totalAnalyzed).toFixed(1)) : 0,
      cognitiveComplexity: totalAnalyzed > 0 ? parseFloat((analyzedFiles.reduce((sum, a) => sum + (a.metrics?.cognitiveComplexity || 0), 0) / totalAnalyzed).toFixed(1)) : 0,
      duplicateBlocks: analyzedFiles.reduce((sum, a) => sum + (a.metrics?.duplicateBlocks || 0), 0),
    };

    const overallSummary = await generateOverallSummary(
        repoName,
        defaultBranch,
        aggQuality,
        allSecIssues.filter(s => s.severity === 'critical').length,
        allSecIssues.filter(s => s.severity === 'high').length,
        allSugs.length,
        totalAnalyzed,
        analyzedFiles.map(fa => ({ filename: fa.filename, insight: fa.aiInsights }))
    );

    const newScan = new RepositoryScan({
      repositoryId: new mongoose.Types.ObjectId(localRepo._id as string),
      userId: session.user.id,
      owner,
      repoName,
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
      updatedAt: new Date(),
    });

    await newScan.save();
    console.log(`[API/RepoScan] Saved RepositoryScan ${newScan._id} for ${owner}/${repoName}.`);

    return NextResponse.json({ scanId: newScan._id.toString() });

  } catch (error: any) {
    console.error('[API/RepoScan POST] Error Object Type:', Object.prototype.toString.call(error));
    console.error('[API/RepoScan POST] Error Is Error Instance:', error instanceof Error);
    console.error('[API/RepoScan POST] Error Properties:', Object.getOwnPropertyNames(error));
    console.error('[API/RepoScan POST] Full Error Log:', error);

    let clientMessage = 'Failed to initiate repository scan.';
    let detailsForClient = error instanceof Error ? error.message : 'An unexpected error occurred.';
    
    if (detailsForClient.toLowerCase().includes('fetch failed') || detailsForClient.toLowerCase().includes('econnrefused') || detailsForClient.toLowerCase().includes('socket hang up')) {
        clientMessage = "Network error: Could not connect to a required backend service (e.g., AI model server or Genkit development server). Please ensure all backend services are running correctly.";
        detailsForClient = clientMessage;
    } else if (detailsForClient.includes("Could not retrieve valid commit SHA for branch")) {
        clientMessage = "Configuration Error: Could not get essential repository information (commit SHA for default branch). Please ensure the repository is accessible and the default branch exists.";
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
    }, { status: 500 });
  }
}
