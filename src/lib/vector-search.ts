
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
  similarityThresholdParam?: number, // Allow explicit override from caller
  excludeAnalysisId?: string,
  excludeFilename?: string
): Promise<SimilarCodeResult[]> {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db(); 
  
  if (!Array.isArray(queryVector) || queryVector.length !== 768 || !queryVector.every(n => typeof n === 'number' && isFinite(n))) {
    console.error("Invalid queryVector provided to findSimilarCode. Must be an array of 768 finite numbers.");
    return [];
  }

  // Filter by PRs created in the last 12 months
  const dateFilter = new Date();
  dateFilter.setMonth(dateFilter.getMonth() - 12);

  // Determine the effective similarity threshold
  const defaultGeneralSearchThreshold = 0.70; // More lenient for broad searches
  const defaultContextualSearchThreshold = 0.78; // Stricter for finding very similar issues

  const effectiveSimilarityThreshold =
    similarityThresholdParam !== undefined
      ? similarityThresholdParam
      : excludeAnalysisId // If excludeAnalysisId is present, it's likely a contextual search
      ? defaultContextualSearchThreshold
      : defaultGeneralSearchThreshold;
  
  console.log(`[findSimilarCode] Using effective similarity threshold: ${effectiveSimilarityThreshold}`);


  const pipeline: mongoose.PipelineStage[] = [
    {
      $vectorSearch: {
        index: "idx_file_embeddings", 
        path: "fileAnalyses.vectorEmbedding", 
        queryVector: queryVector,
        numCandidates: limit * 20, 
        limit: limit * 5, 
      }
    },
    {
      $addFields: {
        searchScore: { $meta: "vectorSearchScore" }
      }
    },
    { 
      $match: { 
        searchScore: { $gte: effectiveSimilarityThreshold } // Use the determined threshold
      }
    },
    { 
      $unwind: "$fileAnalyses"
    },
    { 
      $match: {
        "fileAnalyses.vectorEmbedding": { $exists: true, $ne: null, $not: {$size: 0} },
        // Match again on searchScore after unwind, but specifically for the file's contribution if possible.
        // This needs a more complex check if we want to ensure the *unwound file's embedding* caused the high score.
        // For now, we rely on the document-level score and that the unwound file has an embedding.
        // A more advanced approach might involve re-scoring or ensuring the specific unwound file's embedding
        // is highly similar to the query vector if the document score is a composite.
        // However, with current $vectorSearch, score is per-document.
        $expr: { // Ensure the specific unwound file has an embedding that *could* match
            $and: [
                { $isArray: "$fileAnalyses.vectorEmbedding" },
                { $gt: [ { $size: "$fileAnalyses.vectorEmbedding" }, 0 ] }
            ]
        }
      }
    },
    ...(excludeAnalysisId && excludeFilename ? [{
      $match: {
        $or: [
          { _id: { $ne: new mongoose.Types.ObjectId(excludeAnalysisId) } },
          { "fileAnalyses.filename": { $ne: excludeFilename } }
        ]
      }
    }] : []),
     ...(excludeAnalysisId && !excludeFilename ? [{ 
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
      $unwind: { path: "$prDetails", preserveNullAndEmptyArrays: false } // Ensure prDetails exists
    },
    {
      $match: { 
        "prDetails.createdAt": { $gte: dateFilter }
      }
    },
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
        aiInsights: { $substrCP: [ "$fileAnalyses.aiInsights", 0, 250 ] }, // Slightly longer snippet
        score: "$searchScore"
      }
    },
    { $sort: { score: -1 } }, 
    { $limit: limit } 
  ];

  try {
    const results = await db.collection('analyses').aggregate(pipeline).toArray();
    console.log(`[findSimilarCode] Found ${results.length} results after aggregation.`);
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

