
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
  limit = 10,
  similarityThresholdParam?: number,
  excludeAnalysisId?: string,
  excludeFilename?: string
): Promise<SimilarCodeResult[]> {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db();

  if (!Array.isArray(queryVector) || queryVector.length !== 768 || !queryVector.every(n => typeof n === 'number' && isFinite(n))) {
    console.error("[findSimilarCode] Invalid queryVector. Must be an array of 768 finite numbers. Received (first 10 elements):", queryVector ? queryVector.slice(0,10) : queryVector);
    return [];
  }

  const defaultGeneralSearchThreshold = 0.50; 
  const defaultContextualSearchThreshold = 0.75; 

  let effectiveSimilarityThreshold: number;
  let searchTypeMessage: string;

  if (similarityThresholdParam !== undefined) {
    effectiveSimilarityThreshold = similarityThresholdParam;
    searchTypeMessage = `explicitly set to ${similarityThresholdParam}`;
  } else if (excludeAnalysisId) { 
    effectiveSimilarityThreshold = defaultContextualSearchThreshold;
    searchTypeMessage = `contextual default (${defaultContextualSearchThreshold})`;
  } else { 
    effectiveSimilarityThreshold = defaultGeneralSearchThreshold;
    searchTypeMessage = `general default (${defaultGeneralSearchThreshold})`;
  }

  console.log(`[findSimilarCode] Using effective similarity threshold: ${effectiveSimilarityThreshold} (Search type: ${searchTypeMessage}, Limit: ${limit})`);
  console.log(`[findSimilarCode] Query vector (first 5 dims): ${queryVector.slice(0,5).join(', ')}`);
  if (excludeAnalysisId) console.log(`[findSimilarCode] Excluding analysisId: ${excludeAnalysisId}, filename: ${excludeFilename || 'N/A'}`);


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
        searchScore: { $gte: effectiveSimilarityThreshold } 
      }
    },
    {
      $unwind: "$fileAnalyses" 
    },
    {
      $match: {
        "fileAnalyses.vectorEmbedding": { $exists: true, $ne: null, $not: {$size: 0} },
        $expr: {
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
      $unwind: { path: "$prDetails", preserveNullAndEmptyArrays: false } 
    },
    // Removed date filter: "prDetails.createdAt": { $gte: dateFilter }
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
        score: "$searchScore" 
      }
    },
    { $sort: { score: -1 } }, 
    { $limit: limit } 
  ];

  try {
    const results = await db.collection('analyses').aggregate(pipeline).toArray();
    console.log(`[findSimilarCode] Vector search returned ${results.length} results after thresholding and limiting.`);
    if (results.length === 0) {
      console.warn(`[findSimilarCode] No results found. This could be due to the threshold (${effectiveSimilarityThreshold}), no matching data, or an issue with the query/index.`);
    }
    return results as SimilarCodeResult[];
  } catch (error) {
    console.error("[findSimilarCode] Error during Atlas Vector Search aggregation:", error);
    console.warn("[findSimilarCode] Atlas Vector Search failed. Check index 'idx_file_embeddings' on 'analyses' collection (path 'fileAnalyses.vectorEmbedding', 768 dims, cosine). Also verify pipeline stages and data integrity (valid vector embeddings).");
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
  // Example (requires a text search index named 'default' on 'fileAnalyses.filename' and 'fileAnalyses.aiInsights'):
  /*
  const pipeline = [
    {
      $search: {
        index: 'default_text_search_index', // replace with your Atlas Search text index name
        text: {
          query: queryText,
          path: { wildcard: 'fileAnalyses.*' }, // Search multiple fields within fileAnalyses
          fuzzy: { maxEdits: 1, prefixLength: 2 }
        }
      }
    },
    // ... (similar $unwind, $lookup, $project stages as vector search if needed)
    { $limit: limit }
  ];
  const results = await db.collection('analyses').aggregate(pipeline).toArray();
  return results;
  */
  return [];
}

