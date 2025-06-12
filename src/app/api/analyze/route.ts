import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPullRequestDetails, getPullRequestFiles, getFileContent, getRepositoryDetails } from '@/lib/github';
import { analyzeCode } from '@/ai/flows/code-quality-analysis'; // Using Genkit AI flow
import { PullRequest, Analysis, Repository, connectMongoose } from '@/lib/mongodb';
import type { CodeAnalysisOutput, FileAnalysisItem, CodeAnalysisMetrics, PullRequest as PRType, CodeFile as CodeFileType } from '@/types';

const MAX_FILES_TO_ANALYZE = 10; // Limit number of files analyzed for performance

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

    // Find the local repository to link the PR
    let localRepo = await Repository.findOne({ fullName: repoFullName, userId: session.user.id });
    if (!localRepo) {
      // If not found, try to fetch and save it
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


    // Check if analysis already exists for this PR in MongoDB
    const existingPR = await PullRequest.findOne({
      repositoryId: localRepo._id.toString(), // Use local repo ID
      number: pullNumber,
    }).populate('analysis');

    if (existingPR && existingPR.analysis) {
      return NextResponse.json({ analysis: existingPR.analysis, pullRequest: existingPR });
    }

    // Fetch PR data from GitHub
    const ghPullRequest = await getPullRequestDetails(owner, repoName, pullNumber);
    if (!ghPullRequest) {
      return NextResponse.json({ error: 'Pull request not found on GitHub' }, { status: 404 });
    }

    const ghFiles = await getPullRequestFiles(owner, repoName, pullNumber);

    const fileAnalysesPromises = ghFiles
      .filter(file => file.status !== 'removed' && file.patch && (file.filename?.match(/\.(js|ts|py|java|cs|go|rb|php|html|css|scss|json|md|yaml|yml)$/i))) // Basic filter for code-like files
      .slice(0, MAX_FILES_TO_ANALYZE)
      .map(async (file): Promise<FileAnalysisItem | null> => {
        try {
          // Attempt to get full file content. Fallback to patch if content is unavailable or too large.
          let contentToAnalyze = await getFileContent(owner, repoName, file.filename, ghPullRequest.head.sha);
          
          if (!contentToAnalyze) {
            // If full content isn't available (e.g. large file, binary, submodule), use patch.
            // The AI might not be as effective with just a patch.
            // contentToAnalyze = file.patch; // Or decide to skip
            console.warn(`Could not get content for ${file.filename}, skipping its analysis.`);
            return null; 
          }
          
          // Limit content size to avoid overly long AI requests
          if (contentToAnalyze.length > 50000) { // 50k char limit
             console.warn(`File ${file.filename} is too large (${contentToAnalyze.length} chars), truncating.`);
             contentToAnalyze = contentToAnalyze.substring(0, 50000);
          }

          const aiResponse: CodeAnalysisOutput = await analyzeCode({ code: contentToAnalyze, filename: file.filename });
          return {
            filename: file.filename,
            qualityScore: aiResponse.qualityScore,
            complexity: aiResponse.complexity,
            maintainability: aiResponse.maintainability,
            securityIssues: aiResponse.securityIssues || [],
            suggestions: aiResponse.suggestions || [],
            metrics: aiResponse.metrics || { linesOfCode: 0, cyclomaticComplexity: 0, cognitiveComplexity: 0, duplicateBlocks: 0 },
            aiInsights: aiResponse.aiInsights || '',
          };
        } catch (error: any) {
          console.error(`Error analyzing file ${file.filename}:`, error.message);
          return null; // Skip this file on error
        }
      });

    const fileAnalysesResults = (await Promise.all(fileAnalysesPromises)).filter(Boolean) as FileAnalysisItem[];

    // Aggregate analysis results
    const totalAnalyzedFiles = fileAnalysesResults.length;
    const aggregatedAnalysis: Omit<CodeAnalysisOutput, '_id' | 'pullRequestId' | 'createdAt'> & { fileAnalyses?: FileAnalysisItem[] } = {
      qualityScore: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.qualityScore, 0) / totalAnalyzedFiles : 0,
      complexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.complexity, 0) / totalAnalyzedFiles : 0,
      maintainability: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + a.maintainability, 0) / totalAnalyzedFiles : 0,
      securityIssues: fileAnalysesResults.flatMap(a => a.securityIssues || []),
      suggestions: fileAnalysesResults.flatMap(a => a.suggestions || []),
      metrics: {
        linesOfCode: ghFiles.reduce((sum, f) => sum + (f.additions || 0), 0), // Total additions in PR
        cyclomaticComplexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cyclomaticComplexity || 0), 0) / totalAnalyzedFiles : 0,
        cognitiveComplexity: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.cognitiveComplexity || 0), 0) / totalAnalyzedFiles : 0,
        duplicateBlocks: totalAnalyzedFiles > 0 ? fileAnalysesResults.reduce((sum, a) => sum + (a.metrics?.duplicateBlocks || 0), 0) : 0,
      },
      aiInsights: fileAnalysesResults.map(a => `${a.filename}:\n${a.aiInsights}`).join('\n\n---\n\n') || 'No AI insights generated.',
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

    // Save PullRequest and Analysis to MongoDB
    let savedPR = existingPR;
    if (!savedPR) {
      savedPR = new PullRequest({
        repositoryId: localRepo._id.toString(),
        githubId: ghPullRequest.id, // Store GitHub's global PR ID
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
        // timestamps from GitHub
        createdAt: new Date(ghPullRequest.created_at), 
        updatedAt: new Date(ghPullRequest.updated_at),
      });
    } else {
      // Update existing PR data if fetched again
      savedPR.title = ghPullRequest.title;
      savedPR.body = ghPullRequest.body;
      savedPR.state = ghPullRequest.state as PRType['state'];
      savedPR.files = prFiles;
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
