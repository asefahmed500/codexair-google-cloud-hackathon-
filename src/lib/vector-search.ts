
import clientPromise, { connectMongoose, Analysis, PullRequest, RepositoryScan } from './mongodb';
import type { SimilarCodeResult } from '@/types';
import mongoose from 'mongoose';

// This function is a placeholder for creating embeddings if not done by the main AI flow.
// As of the latest changes, embeddings are generated in /api/analyze by a dedicated Genkit model.
export async function _placeholder_createCodeEmbedding(code: string): Promise<number[]> {
  // This is a placeholder. In a real scenario, you'd call an embedding model (e.g., via Genkit or directly).
  console.warn("Using placeholder for _placeholder_createCodeEmbedding. Embeddings are now generated in the /api/analyze route.");
  const placeholderVector = Array(768).fill(0).map(() => Math.random() * 0.1);
  placeholderVector[0] = code.length / 1000;
  return placeholderVector;
}

export async function findSimilarCode(
  queryVector: number[],
  limit = 10,
  similarityThresholdParam?: number,
  excludeAnalysisOrScanId?: string, 
  excludeFilename?: string
): Promise<SimilarCodeResult[]> {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db();

  if (!Array.isArray(queryVector) || queryVector.length !== 768 || !queryVector.every(n => typeof n === 'number' && isFinite(n))) {
    console.error("[findSimilarCode] Invalid queryVector. Must be an array of 768 finite numbers. Received (first 10 elements):", queryVector ? queryVector.slice(0,10) : queryVector);
    return [];
  }

  const defaultGeneralSearchThreshold = 0.40;
  const defaultContextualSearchThreshold = 0.75; 

  let effectiveSimilarityThreshold: number;
  let searchTypeMessage: string;

  if (similarityThresholdParam !== undefined) {
    effectiveSimilarityThreshold = similarityThresholdParam;
    searchTypeMessage = `explicitly set to ${similarityThresholdParam}`;
  } else if (excludeAnalysisOrScanId && excludeFilename) { 
    effectiveSimilarityThreshold = defaultContextualSearchThreshold;
    searchTypeMessage = `contextual default (${defaultContextualSearchThreshold})`;
  } else { 
    effectiveSimilarityThreshold = defaultGeneralSearchThreshold;
    searchTypeMessage = `general default (${defaultGeneralSearchThreshold})`;
  }
  
  console.log(`[findSimilarCode] Using effective similarity threshold: ${effectiveSimilarityThreshold} (Search type: ${searchTypeMessage}, Limit: ${limit})`);
  if (excludeAnalysisOrScanId) console.log(`[findSimilarCode] Excluding ID: ${excludeAnalysisOrScanId}, filename: ${excludeFilename || 'N/A'}`);

  // Pipeline for PR Analyses
  const prAnalysisPipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: "idx_file_embeddings",
        path: "fileAnalyses.vectorEmbedding", 
        queryVector: queryVector,
        numCandidates: limit * 20, // Fetch more candidates to sort/filter later
        limit: limit * 10, // Higher internal limit for vector search itself
      }
    },
    { $addFields: { searchScore: { $meta: "vectorSearchScore" } } },
    { $match: { searchScore: { $gte: effectiveSimilarityThreshold } } },
    { $unwind: "$fileAnalyses" },
    { $match: { "fileAnalyses.vectorEmbedding": { $exists: true, $ne: null, $not: {$size: 0} } } },
    ...(excludeAnalysisOrScanId && excludeFilename ? [{
      $match: {
        $or: [
          { _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisOrScanId) } },
          { "fileAnalyses.filename": { $ne: excludeFilename } }
        ]
      }
    }] : []),
     ...(excludeAnalysisOrScanId && !excludeFilename ? [{
      $match: {
         _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisOrScanId) }
      }
    }] : []),
    {
      $lookup: {
        from: "pullrequests", 
        localField: "pullRequestId",
        foreignField: "_id",
        as: "prDetails"
      }
    },
    { $unwind: { path: "$prDetails", preserveNullAndEmptyArrays: false } }, // Ensure PR details exist
    {
      $project: {
        _id: 0, 
        analysisId: "$_id", 
        owner: "$prDetails.owner",
        repoName: "$prDetails.repoName",
        prNumber: "$prDetails.number",
        prTitle: "$prDetails.title",
        prAuthorLogin: "$prDetails.author.login",
        prCreatedAt: "$prDetails.createdAt",
        filename: "$fileAnalyses.filename",
        aiInsights: { $substrCP: [ "$fileAnalyses.aiInsights", 0, 250 ] }, 
        score: "$searchScore",
        searchResultType: "pr_analysis" as const, // Type assertion
        scanBranch: null, 
        scanCommitSha: null, 
        scanCreatedAt: null, 
      }
    }
  ];

  // Pipeline for Repository Scans
  const repoScanPipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: "idx_repo_scan_file_embeddings", 
        path: "fileAnalyses.vectorEmbedding",
        queryVector: queryVector,
        numCandidates: limit * 20,
        limit: limit * 10,
      }
    },
    { $addFields: { searchScore: { $meta: "vectorSearchScore" } } },
    { $match: { searchScore: { $gte: effectiveSimilarityThreshold } } },
    { $unwind: "$fileAnalyses" },
    { $match: { "fileAnalyses.vectorEmbedding": { $exists: true, $ne: null, $not: {$size: 0} } } },
    ...(excludeAnalysisOrScanId && excludeFilename ? [{
      $match: {
        $or: [
          { _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisOrScanId) } },
          { "fileAnalyses.filename": { $ne: excludeFilename } }
        ]
      }
    }] : []),
    ...(excludeAnalysisOrScanId && !excludeFilename ? [{
      $match: {
         _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisOrScanId) }
      }
    }] : []),
    {
      $project: {
        _id: 0,
        analysisId: "$_id", 
        owner: "$owner",
        repoName: "$repoName",
        filename: "$fileAnalyses.filename",
        aiInsights: { $substrCP: [ "$fileAnalyses.aiInsights", 0, 250 ] },
        score: "$searchScore",
        searchResultType: "repo_scan" as const, // Type assertion
        scanBranch: "$branchAnalyzed",
        scanCommitSha: "$commitShaAnalyzed",
        scanCreatedAt: "$createdAt",
        prNumber: null, 
        prTitle: null, 
        prAuthorLogin: null, 
        prCreatedAt: null, 
      }
    }
  ];
  
  try {
    console.log(`[findSimilarCode] Executing separate searches. Threshold: ${effectiveSimilarityThreshold}`);
    
    const prResultsPromise = db.collection('analyses').aggregate(prAnalysisPipeline).toArray();
    const scanResultsPromise = db.collection('repositoryscans').aggregate(repoScanPipeline).toArray();

    const [prResults, scanResults] = await Promise.all([prResultsPromise, scanResultsPromise]);

    console.log(`[findSimilarCode] PR search returned ${prResults.length} results.`);
    console.log(`[findSimilarCode] Repo Scan search returned ${scanResults.length} results.`);

    const combinedResults = [
      ...(prResults as SimilarCodeResult[]), 
      ...(scanResults as SimilarCodeResult[])
    ];

    // Sort by score descending and then limit
    const sortedAndLimitedResults = combinedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    console.log(`[findSimilarCode] Combined, sorted, and limited search returned ${sortedAndLimitedResults.length} results.`);
    
    if (sortedAndLimitedResults.length === 0) {
      console.warn(`[findSimilarCode] No results found from combined search. Threshold (${effectiveSimilarityThreshold}).`);
    }
    return sortedAndLimitedResults;

  } catch (error) {
    console.error("[findSimilarCode] Error during Atlas Vector Search aggregation (separate queries):", error);
    console.warn("[findSimilarCode] Atlas Vector Search failed. Check indices 'idx_file_embeddings' on 'analyses' AND 'idx_repo_scan_file_embeddings' on 'repositoryscans'. Path: 'fileAnalyses.vectorEmbedding', 768 dims, cosine.");
    return [];
  }
}

export async function setupVectorSearch() {
  await connectMongoose();
  console.log('MongoDB Atlas Vector Search index setup guide:');
  console.log('Ensure you have TWO vector search indexes:');
  console.log('1. For the "analyses" collection (PR Analyses):');
  console.log('   - Index Name: idx_file_embeddings (must match usage in `findSimilarCode`)');
  console.log('   - Target Field Path for vector: fileAnalyses.vectorEmbedding');
  console.log('   - Number of Dimensions: 768');
  console.log('   - Similarity Metric: cosine');
  console.log('2. For the "repositoryscans" collection (Full Repository Scans):');
  console.log('   - Index Name: idx_repo_scan_file_embeddings (must match usage in `findSimilarCode`)');
  console.log('   - Target Field Path for vector: fileAnalyses.vectorEmbedding');
  console.log('   - Number of Dimensions: 768');
  console.log('   - Similarity Metric: cosine');
  console.log('Ensure this setup is complete for semantic vector search functionality to work across both data types.');
}


/**
 * Placeholder for Duplicate Code Detection using MinHash/LSH algorithms.
 * This is a distinct approach from semantic vector search and aims to find
 * near-exact or structural duplicates.
 */
export async function findDuplicateCodeBySignature(codeContent: string, currentFileId?: string): Promise<any[]> {
  console.warn(`[findDuplicateCodeBySignature] This feature (MinHash/LSH based duplicate detection) is a placeholder.`);
  return [];
}

/**
 * Placeholder for Historical Pattern Analysis using Time-Series Vector Clustering.
 */
export async function findHistoricalErrorPatterns(): Promise<any[]> {
  console.warn("[findHistoricalErrorPatterns] This feature (Time-series vector clustering for historical pattern analysis) is a placeholder.");
  return [];
}


/**
 * Placeholder for Atlas Full-Text Search functionality.
 */
export async function findTextSearchResults(queryText: string, limit = 10): Promise<any[]> {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db();

  console.warn("findTextSearchResults is a placeholder. To implement Atlas Full-Text Search, define a Search Index in Atlas.");
  return [];
}

