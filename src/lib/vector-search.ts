
import clientPromise, { connectMongoose, Analysis } from './mongodb'; // Assuming Analysis model might be used or relevant

// This function is a placeholder for creating embeddings if not done by the main AI flow.
// As of the latest changes, embeddings are generated in /api/analyze by a dedicated Genkit model.
export async function _placeholder_createCodeEmbedding(code: string): Promise<number[]> {
  // This is a placeholder. In a real scenario, you'd call an embedding model (e.g., via Genkit or directly).
  console.warn("Using placeholder for _placeholder_createCodeEmbedding. Embeddings are now generated in the /api/analyze route.");
  const placeholderVector = Array(768).fill(0).map(() => Math.random() * 0.1); 
  placeholderVector[0] = code.length / 1000; 
  return placeholderVector;
}

export async function findSimilarCode(queryVector: number[], limit = 5, similarityThreshold = 0.85) {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db(); 
  
  if (!Array.isArray(queryVector) || !queryVector.every(n => typeof n === 'number')) {
    console.error("Invalid queryVector provided to findSimilarCode.");
    return [];
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: "idx_file_embeddings", 
        path: "fileAnalyses.vectorEmbedding", 
        queryVector: queryVector,
        numCandidates: limit * 15, 
        limit: limit, 
      }
    },
    {
      $unwind: "$fileAnalyses" 
    },
    { 
      $addFields: {
        "searchScore": { $meta: "vectorSearchScore" } 
      }
    },
    { 
        $match: {
            "searchScore": { $gte: similarityThreshold },
            "fileAnalyses.vectorEmbedding": { $exists: true, $ne: null, $not: {$size: 0} } // Ensure embedding exists
        }
    },
    { 
      $project: {
        _id: 0, 
        pullRequestId: 1,
        filename: "$fileAnalyses.filename",
        originalDocId: "$_id", 
        qualityScore: "$fileAnalyses.qualityScore",
        aiInsights: "$fileAnalyses.aiInsights",
        score: "$searchScore"
      }
    },
    { $sort: { score: -1 } }, 
    { $limit: limit } 
  ];

  try {
    const results = await db.collection('analyses').aggregate(pipeline).toArray();
    return results;
  } catch (error) {
    console.error("Error during Atlas Vector Search:", error);
    console.warn("Atlas Vector Search failed. Ensure your index 'idx_file_embeddings' is correctly configured on 'analyses' collection for path 'fileAnalyses.vectorEmbedding' (768 dimensions, cosine similarity recommended).");
    return [];
  }
}

export async function setupVectorSearch() {
  await connectMongoose();
  console.log('MongoDB Atlas Vector Search index setup guide:');
  console.log('1. Go to your MongoDB Atlas cluster.');
  console.log('2. Select the database (e.g., "codexairdb").');
  console.log('3. Go to the "Search" tab and click "Create Search Index".');
  console.log('4. Choose "Atlas Vector Search" visual editor or JSON editor.');
  console.log('5. Configure the index for the "analyses" collection.');
  console.log('   - Index Name: e.g., idx_file_embeddings (must match usage in `findSimilarCode`)');
  console.log('   - Target Field Path for vector: fileAnalyses.vectorEmbedding');
  console.log('   - Number of Dimensions: 768');
  console.log('   - Similarity Metric: cosine (recommended)');
  console.log('Ensure this setup is complete for vector search functionality to work.');
}


// Placeholder for MinHash/LSH based duplicate detection as mentioned in PRD
// This is distinct from semantic vector search.
export async function findDuplicateCodeBySignature(codeContent: string): Promise<any[]> {
  console.warn("findDuplicateCodeBySignature (e.g., using MinHash/LSH) is not yet implemented.");
  // 1. Preprocess code (e.g., normalize, remove comments/whitespace).
  // 2. Generate shingles (k-grams) from the code.
  // 3. Compute MinHash signature for the shingles.
  // 4. Use Locality Sensitive Hashing (LSH) to find candidate similar signatures from a database of stored signatures.
  // 5. Compare candidates more thoroughly (e.g., Jaccard index on MinHash signatures or shingles).
  return [];
}
// Note: Storing and querying these signatures would require additional schema and database indexing.
// For example, you might store MinHash signatures in a separate collection or alongside file analyses.

// setupVectorSearch(); // You might call this once when the app starts, or log it.
