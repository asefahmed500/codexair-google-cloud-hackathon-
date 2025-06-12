import clientPromise, { connectMongoose } from './mongodb';
// Removed: import { analyzeCodeQuality } from './google-cloud'; as it's not used here and lib/google-cloud.ts won't be created.

// This function is a placeholder. In a real application, you would use a proper embedding model.
export async function createCodeEmbedding(code: string): Promise<number[]> {
  // For simplicity, we'll create a basic feature vector.
  // This is NOT a production-ready embedding.
  const features = {
    linesOfCode: code.split('\n').length,
    complexity: (code.match(/if|for|while|switch/g) || []).length,
    functions: (code.match(/function|=>|def|class func/g) || []).length, // Broader function matching
    variables: (code.match(/let|const|var|\w+\s*=/g) || []).length, // Broader variable assignment matching
    comments: (code.match(/\/\/|\/\*|\*\/|# /g) || []).length, // Broader comment matching
  };

  // Normalize features to create a simple vector
  const maxValues = { linesOfCode: 1000, complexity: 50, functions: 20, variables: 100, comments: 100 };
  
  const vector = Object.entries(features).map(([key, value]) => 
    Math.min(value / (maxValues[key as keyof typeof maxValues] || 100), 1) // Ensure divisor is not zero
  );

  // Ensure vector has a fixed length if needed by Atlas Vector Search
  // For example, if Atlas expects a 5-dim vector:
  const expectedDim = 5;
  while(vector.length < expectedDim) {
    vector.push(0);
  }
  return vector.slice(0, expectedDim);
}

export async function findSimilarCode(codeSnippet: string, limit = 5) {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db(); // Use default DB from MONGODB_URI or specify if needed
  
  const embedding = await createCodeEmbedding(codeSnippet);
  
  // This is a placeholder for MongoDB Atlas Vector Search $vectorSearch query.
  // The current implementation does a naive similarity scan, which is not efficient for large datasets.
  // You would replace this with an aggregation pipeline using $vectorSearch.
  // Example (conceptual, syntax depends on your Atlas Search index configuration):
  /*
  const results = await db.collection('analyses').aggregate([
    {
      $vectorSearch: {
        index: 'your_vector_search_index_name', // Name of your Atlas Vector Search index
        path: 'embeddingField', // The field in your documents that contains the vector
        queryVector: embedding,
        numCandidates: limit * 10, // Number of candidates to consider
        limit: limit,
      }
    },
    {
      $project: { // Project fields you need, including score
        _id: 1,
        pullRequestId: 1,
        // ... other fields ...
        score: { $meta: 'vectorSearchScore' } 
      }
    }
  ]).toArray();
  return results;
  */

  // Fallback naive search (inefficient):
  console.warn("Using naive similarity search. For production, configure MongoDB Atlas Vector Search.");
  const analyses = await db.collection('analyses').find({
    // Assuming 'fileAnalyses.0.metrics' exists and can be used to generate a comparable embedding
    // This is highly dependent on how embeddings are stored.
    // For this placeholder, we'll assume an 'embedding' field exists on the 'analyses' documents.
    'embedding': { $exists: true } 
  }).limit(limit * 10).toArray(); // Fetch more candidates to sort

  const similarities = analyses.map((analysis: any) => {
    // Ensure analysis.embedding is an array of numbers
    const analysisEmbedding = Array.isArray(analysis.embedding) && analysis.embedding.every(n => typeof n === 'number')
      ? analysis.embedding
      : Array(embedding.length).fill(0); // Default to zero vector if invalid

    const similarity = embedding.reduce((sum, val, idx) => 
      sum + val * (analysisEmbedding[idx] || 0), 0 // Dot product
    );
    
    return {
      ...analysis,
      similarity,
    };
  });

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function setupVectorSearch() {
  await connectMongoose();
  const client = await clientPromise;
  const db = client.db();
  
  // This function would typically define and create a MongoDB Atlas Vector Search index.
  // This is done through the Atlas UI or Atlas Admin API, not typically client-side code.
  // The `createIndex` method shown in the user prompt with '2dsphere' is for geospatial data, not vector search.
  // For Atlas Vector Search, you define an index like:
  /*
  {
    "name": "vector_search_index",
    "collectionName": "analyses",
    "database": "your_db_name",
    "fields": [
      {
        "type": "vector",
        "path": "embeddingField", // field storing the vector
        "numDimensions": 5, // Dimension of your vectors
        "similarity": "cosine" // or "euclidean" or "dotProduct"
      }
    ]
  }
  */
  console.log('MongoDB Atlas Vector Search setup should be done via Atlas UI or Admin API.');
  console.log('Ensure a vector search index is configured on the `analyses` collection for the `embedding` field.');
}
