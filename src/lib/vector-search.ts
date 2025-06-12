
import clientPromise, { connectMongoose, Analysis, PullRequest } from './mongodb'; 
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
  limit = 5, 
  similarityThreshold = 0.8, // Adjusted threshold slightly
  excludeAnalysisId?: string,
  excludeFilename?: string
): Promise<SimilarCodeResult[]> {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db(); 
  
  if (!Array.isArray(queryVector) || queryVector.length !== 768 || !queryVector.every(n => typeof n === 'number')) {
    console.error("Invalid queryVector provided to findSimilarCode. Must be an array of 768 numbers.");
    return [];
  }

  // Filter by PRs created in the last 12 months
  const dateFilter = new Date();
  dateFilter.setMonth(dateFilter.getMonth() - 12);

  const pipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: "idx_file_embeddings", 
        path: "fileAnalyses.vectorEmbedding", 
        queryVector: queryVector,
        numCandidates: limit * 20, // Increased candidates for better filtering
        limit: limit * 5, // Fetch more initially to allow for filtering
      }
    },
    {
      $addFields: {
        searchScore: { $meta: "vectorSearchScore" }
      }
    },
    {
      $match: { // Initial match on vector search score
        searchScore: { $gte: similarityThreshold }
      }
    },
    { // Unwind fileAnalyses to access individual file details and embeddings
      $unwind: "$fileAnalyses"
    },
    { // Secondary match to ensure the unwound file has an embedding and contributes to score
      $match: {
        "fileAnalyses.vectorEmbedding": { $exists: true, $ne: null, $not: {$size: 0} },
        // This re-match on score after unwind isn't strictly necessary if the score is top-level,
        // but ensures we are dealing with relevant files.
        // The score is per-document, so we rely on vectorSearch hitting right docs.
      }
    },
    // Filter out the exact source document/file if specified
    ...(excludeAnalysisId && excludeFilename ? [{
      $match: {
        $or: [
          { _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisId) } },
          { "fileAnalyses.filename": { $ne: excludeFilename } }
        ]
      }
    }] : []),
     ...(excludeAnalysisId && !excludeFilename ? [{ // Only exclude by analysisId if filename not provided
      $match: {
         _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisId) } 
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
    {
      $unwind: "$prDetails"
    },
    {
      $match: { // Filter by PR date
        "prDetails.createdAt": { $gte: dateFilter }
      }
    },
    { 
      $project: { 
        _id: 0, 
        analysisId: "$_id", // ID of the Analysis document where similar code found
        owner: "$prDetails.owner",
        repoName: "$prDetails.repoName",
        prNumber: "$prDetails.number",
        prTitle: "$prDetails.title",
        prAuthorLogin: "$prDetails.author.login",
        prCreatedAt: "$prDetails.createdAt",
        filename: "$fileAnalyses.filename",
        // Select a concise part of aiInsights, or description if more suitable
        aiInsights: { $substrCP: [ "$fileAnalyses.aiInsights", 0, 150 ] }, // Snippet
        score: "$searchScore"
      }
    },
    { $sort: { score: -1 } }, 
    { $limit: limit } // Final limit after all filtering
  ];

  try {
    const results = await db.collection('analyses').aggregate(pipeline).toArray();
    return results as SimilarCodeResult[];
  } catch (error) {
    console.error("Error during Atlas Vector Search for semantic code matching:", error);
    console.warn("Atlas Vector Search for semantic matching failed. Ensure your index 'idx_file_embeddings' is correctly configured on 'analyses' collection for path 'fileAnalyses.vectorEmbedding' (768 dimensions, cosine similarity recommended). Also check collection names and field paths in the aggregation pipeline.");
    return [];
  }
}

export async function setupVectorSearch() {
  await connectMongoose();
  console.log('MongoDB Atlas Vector Search index setup guide (for Semantic Code Matching):');
  console.log('1. Go to your MongoDB Atlas cluster.');
  console.log('2. Select the database (e.g., "codexairdb").');
  console.log('3. Go to the "Search" tab and click "Create Search Index".');
  console.log('4. Choose "Atlas Vector Search" visual editor or JSON editor.');
  console.log('5. Configure the index for the "analyses" collection.');
  console.log('   - Index Name: idx_file_embeddings (must match usage in `findSimilarCode`)');
  console.log('   - Target Field Path for vector: fileAnalyses.vectorEmbedding');
  console.log('   - Number of Dimensions: 768');
  console.log('   - Similarity Metric: cosine (recommended)');
  console.log('Ensure this setup is complete for semantic vector search functionality to work.');
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
