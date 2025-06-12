
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

    let localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
      const ghRepo = await getRepositoryDetails(owner, repoName);
      localRepo = await Repository.findOneAndUpdate(
        { githubId: ghRepo.id, userId: session.user.id },
        {
          name: ghRepo.name,
          fullName: ghRepo.full_name,
          owner: ghRepo.owner.login,
          githubId: ghRepo.id,
          language: ghRepo.language || 'N/A',
          stars: ghRepo.stargazers_count || 0,
          isPrivate: ghRepo.private,
          userId: session.user.id,
        },
        { upsert: true, new: true }
      );
    }
    if (!localRepo) {
        return NextResponse.json({ error: `Repository ${repoFullName} not found or could not be synced.` }, { status: 404 });
    }

    const existingPR = await PullRequest.findOne({
      repositoryId: localRepo._id.toString(), 
      number: pullNumber,
    }).populate('analysis');

    if (existingPR && existingPR.analysis) {
      return NextResponse.json({ analysis: existingPR.analysis, pullRequest: existingPR });
    }

    const ghPullRequest = await getPullRequestDetails(owner, repoName, pullNumber);
    if (!ghPullRequest) {
      return NextResponse.json({ error: 'Pull request not found on GitHub' }, { status: 404 });
    }

    const ghFiles = await getPullRequestFiles(owner, repoName, pullNumber);

    const filesToConsider = ghFiles
      .filter(file => 
        (file.status === 'added' || file.status === 'modified' || file.status === 'renamed') &&
        file.filename?.match(/\.(js|ts|jsx|tsx|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i)
      )
      .slice(0, MAX_FILES_TO_ANALYZE);

    const fileAnalysesPromises = filesToConsider.map(async (file): Promise<FileAnalysisItem | null> => {
        try {
          let contentToAnalyze: string | null = null;
          let analysisContext = "full file"; // For logging

          if (file.status === 'added') {
            contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
            analysisContext = "full file (added)";
          } else if ((file.status === 'modified' || file.status === 'renamed') && file.patch) {
            const addedLines = extractAddedLinesFromPatch(file.patch);
            if (addedLines.trim() !== '') {
              contentToAnalyze = addedLines;
              analysisContext = "diff (added lines)";
            } else {
              console.warn(`Patch for ${file.filename} (status: ${file.status}) yielded no added lines. Analyzing full content.`);
              contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
              analysisContext = "full file (fallback from diff)";
            }
          } else {
            // Fallback for other scenarios if any, or if conditions aren't met
             console.warn(`Unhandled file status or condition for ${file.filename} (status: ${file.status}). Analyzing full content as fallback.`);
            contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
            analysisContext = "full file (general fallback)";
          }
          
          if (!contentToAnalyze) {
            console.warn(`Could not get content for ${file.filename} (status: ${file.status}) using ${analysisContext}, skipping its analysis.`);
            return null; 
          }
          
          console.log(`Analyzing ${file.filename} (context: ${analysisContext})`);

          if (contentToAnalyze.length > 70000) { // Increased limit slightly for diffs that might be larger than individual small files
             console.warn(`Content for ${file.filename} is too large (${contentToAnalyze.length} chars), truncating.`);
             contentToAnalyze = contentToAnalyze.substring(0, 70000);
          }

          const aiResponse: AIAnalysisOutput = await analyzeCode({ code: contentToAnalyze, filename: file.filename });
          
          let fileEmbedding: number[] | undefined = undefined;
          if (contentToAnalyze) { // Use the same content (diff or full file) for embedding
            try {
              const embeddingResult = await ai.generate({
                model: 'googleai/text-embedding-004',
                prompt: contentToAnalyze,
              });
              if (embeddingResult.output && Array.isArray(embeddingResult.output) && embeddingResult.output.every(n => typeof n === 'number')) {
                  fileEmbedding = embeddingResult.output as number[];
              } else if (embeddingResult.output && typeof embeddingResult.output === 'object') {
                  const outputObj = embeddingResult.output as any;
                  if (outputObj.embedding && Array.isArray(outputObj.embedding) && outputObj.embedding.every((n:any) => typeof n === 'number')) {
                      fileEmbedding = outputObj.embedding;
                  } else if (outputObj.vector && Array.isArray(outputObj.vector) && outputObj.vector.every((n:any) => typeof n === 'number')) {
                      fileEmbedding = outputObj.vector;
                  }
              }

              if (!fileEmbedding) {
                 console.warn(`Unexpected or missing embedding format for ${file.filename} from embedding model. Output:`, embeddingResult.output);
              } else if (fileEmbedding.length !== EMBEDDING_DIMENSIONS) {
                console.warn(`Generated embedding for ${file.filename} has ${fileEmbedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Embedding will not be stored.`);
                fileEmbedding = undefined;
              }
            } catch (embeddingError: any) {
              console.error(`Error generating embedding for file ${file.filename}:`, embeddingError.message);
            }
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
          console.error(`Error analyzing file ${file.filename}:`, error.message, error.stack);
          return null; 
        }
      });

    const fileAnalysesResults = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];

    const totalAnalyzedFiles = fileAnalysesResults.length;
    const aggregatedAnalysis: Omit<AIAnalysisOutput, '_id' | 'pullRequestId' | 'createdAt' | 'vectorEmbedding'> & { fileAnalyses?: FileAnalysisItem[] } = {
      qualityScore: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzedFiles : 0,
      complexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzedFiles : 0,
      maintainability: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzedFiles : 0,
      securityIssues: fileAnalysesResults.flatMap(a => a.securityIssues || []),
      suggestions: fileAnalysesResults.flatMap(a => a.suggestions || []),
      metrics: {
        linesOfCode: fileAnalysesResults.reduce((sum, fa) => sum + (fa.metrics?.linesOfCode || 0), 0), // Sum lines from analyzed content
        cyclomaticComplexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cyclomaticComplexity || 0), 0) / totalAnalyzedFiles : 0,
        cognitiveComplexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cognitiveComplexity || 0), 0) / totalAnalyzedFiles : 0,
        duplicateBlocks: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.duplicateBlocks || 0), 0) : 0,
      },
      aiInsights: fileAnalysesResults.map(a => `${a.filename} (Analyzed: ${a.metrics?.linesOfCode || 'N/A'} lines):\n${a.aiInsights}`).join('\n\n---\n\n') || 'No AI insights generated.',
      fileAnalyses: fileAnalysesResults,
    };
    
    const prFiles: CodeFileType[] = ghFiles.map(f => ({
        filename: f.filename,
        status: f.status as CodeFileType['status'],
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch || '',
      }));

    let savedPR = existingPR;
    if (!savedPR) {
      savedPR = new PullRequest({
        repositoryId: localRepo._id.toString(),
        githubId: ghPullRequest.id, 
        number: pullNumber,
        title: ghPullRequest.title,
        body: ghPullRequest.body,
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
      savedPR.title = ghPullRequest.title;
      savedPR.body = ghPullRequest.body;
      savedPR.state = ghPullRequest.state as PRType['state'];
      savedPR.files = prFiles; // Update files in case PR changed
      savedPR.updatedAt = new Date(ghPullRequest.updated_at);
    }
    await savedPR.save();

    const analysisDoc = new Analysis({
      pullRequestId: savedPR._id,
      ...aggregatedAnalysis,
    });
    await analysisDoc.save();

    savedPR.analysis = analysisDoc._id;
    await savedPR.save();

    const populatedPR = await PullRequest.findById(savedPR._id).populate('analysis').lean();

    return NextResponse.json({ analysis: analysisDoc, pullRequest: populatedPR });

  } catch (error: any) {
    console.error('Error analyzing pull request:', error, error.stack);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
