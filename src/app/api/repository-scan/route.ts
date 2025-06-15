
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Repository, RepositoryScan, connectMongoose } from '@/lib/mongodb';
import { getDefaultBranch, getRepoFileTree, getFileContent } from '@/lib/github';
import { analyzeCode } from '@/ai/flows/code-quality-analysis';
import { summarizePrAnalysis } from '@/ai/flows/summarize-pr-analysis-flow'; // Re-use for now
import type { FileAnalysisItem, SecurityIssue, Suggestion, CodeAnalysisMetrics, RepositoryScanResult } from '@/types';
import { ai } from '@/ai/genkit'; // For embeddings

const MAX_FILES_TO_SCAN = 5; // Limit for synchronous MVP
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
      prTitle: `${repoName} (Full Scan - ${branchName} branch)`, // Adapt for repo scan context
      overallQualityScore: aggregatedQualityScore,
      totalCriticalIssues: totalCriticalIssues,
      totalHighIssues: totalHighIssues,
      totalSuggestions: allSuggestionsCount,
      fileCount: analyzedFileCount,
      perFileSummaries: perFileSummaries,
    };
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

    const { owner, repoName } = await request.json();
    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Missing owner or repoName' }, { status: 400 });
    }

    await connectMongoose();

    const localRepo = await Repository.findOne({ owner, name: repoName, userId: session.user.id });
    if (!localRepo) {
      return NextResponse.json({ error: 'Repository not found or not synced by user' }, { status: 404 });
    }

    const defaultBranch = await getDefaultBranch(owner, repoName);
    if (!defaultBranch) {
      return NextResponse.json({ error: 'Could not determine default branch for repository' }, { status: 500 });
    }
    
    const repoDetails = await getRepositoryDetails(owner, repoName);
    const headCommitSha = repoDetails.default_branch === defaultBranch ? repoDetails.updated_at : (await getGithubClient().rest.repos.getBranch({owner, repo: repoName, branch: defaultBranch})).data.commit.sha;


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
          console.warn(`[API/RepoScan] Content for ${fileMeta.path} too long, truncating.`);
          contentToAnalyze = contentToAnalyze.substring(0, MAX_CONTENT_LENGTH_FOR_ANALYSIS);
        }

        const aiResponse = await analyzeCode({ code: contentToAnalyze, filename: fileMeta.path! });
        
        let fileEmbeddingVector: number[] | undefined = undefined;
        try {
            const { embedding } = await ai.embed({
            embedder: 'googleai/text-embedding-004',
            content: contentToAnalyze,
            });
            if (embedding && Array.isArray(embedding) && embedding.length === EMBEDDING_DIMENSIONS) {
                fileEmbeddingVector = embedding;
            } else {
                 console.warn(`[API/RepoScan] Invalid embedding for ${fileMeta.path!}. Dimensions: ${embedding?.length}`);
            }
        } catch (embErr: any) {
            console.error(`[API/RepoScan] Embedding error for ${fileMeta.path!}: ${embErr.message}`);
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

    // Aggregate results
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
      repositoryId: localRepo._id,
      userId: session.user.id,
      owner,
      repoName,
      branchAnalyzed: defaultBranch,
      commitShaAnalyzed: headCommitSha, // Store the SHA of the branch HEAD
      status: 'completed',
      qualityScore: aggQuality,
      complexity: aggComplexity,
      maintainability: aggMaintainability,
      securityIssues: allSecIssues,
      suggestions: allSugs,
      metrics: aggMetrics,
      summaryAiInsights: overallSummary,
      fileAnalyses: analyzedFiles,
    });

    await newScan.save();
    console.log(`[API/RepoScan] Saved RepositoryScan ${newScan._id} for ${owner}/${repoName}.`);

    return NextResponse.json({ scanId: newScan._id.toString() });

  } catch (error: any) {
    console.error('[API/RepoScan POST] Error:', error);
    return NextResponse.json({ error: 'Failed to initiate repository scan', details: error.message }, { status: 500 });
  }
}
