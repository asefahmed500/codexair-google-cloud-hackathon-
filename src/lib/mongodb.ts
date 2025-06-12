import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import type { Repository as RepoType, PullRequest as PRType, CodeAnalysis as AnalysisType } from '@/types';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export default clientPromise;

// Mongoose Schemas
const repositorySchema = new mongoose.Schema<RepoType>({
  name: String,
  fullName: String,
  owner: String,
  githubId: { type: Number, unique: true, required: true },
  language: String,
  stars: Number,
  isPrivate: Boolean,
  userId: { type: String, required: true }, // Assuming this is NextAuth user ID
}, { timestamps: true });

const codeFileSchema = new mongoose.Schema({
  filename: String,
  status: String,
  additions: Number,
  deletions: Number,
  changes: Number,
  patch: String,
  content: String,
}, { _id: false });

const analysisSchema = new mongoose.Schema<AnalysisType>({
  pullRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PullRequest', required: true },
  qualityScore: Number,
  complexity: Number,
  maintainability: Number,
  securityIssues: [{
    type: { type: String }, // Explicitly type String for enum-like fields
    severity: String,
    title: String,
    description: String,
    file: String,
    line: Number,
    suggestion: String,
    cwe: String,
  }],
  suggestions: [{
    type: { type: String }, // Explicitly type String
    priority: String,
    title: String,
    description: String,
    file: String,
    line: Number,
    codeExample: String,
  }],
  metrics: {
    linesOfCode: Number,
    cyclomaticComplexity: Number,
    cognitiveComplexity: Number,
    duplicateBlocks: Number,
  },
  aiInsights: String,
  fileAnalyses: [{
    filename: String,
    qualityScore: Number,
    complexity: Number,
    maintainability: Number,
    securityIssues: [{ type: mongoose.Schema.Types.Mixed }], // Keep as Mixed for flexibility
    suggestions: [{ type: mongoose.Schema.Types.Mixed }],
    metrics: { type: mongoose.Schema.Types.Mixed },
    aiInsights: String,
  }],
}, { timestamps: true });


const pullRequestSchema = new mongoose.Schema<PRType>({
  repositoryId: { type: String, required: true }, // Could be ObjectId ref if local Repository collection ID is used
  githubId: { type: Number, required: true },
  number: { type: Number, required: true },
  title: String,
  body: String,
  state: String, // 'open', 'closed', 'merged'
  author: {
    login: String,
    avatar: String,
  },
  files: [codeFileSchema],
  analysis: { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' },
  userId: String, // ID of the user who initiated the analysis or owns the repo link
}, { 
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }, 
  // Unique compound index to prevent duplicate PRs for the same repo and number
  // Note: githubId might be unique across all GitHub, but number is unique per repo.
  // If repositoryId refers to a local DB ID for a repo, this makes sense.
  // If repositoryId is 'owner/repo', then { repositoryId: 1, githubId: 1 } might be better.
  // For now, using githubId for PR and assuming it is globally unique for PRs.
  // If not, a compound index with repository identifier is needed.
  // Let's assume githubId refers to the PR's global ID on GitHub.
  // index: { githubId: 1 }, unique: true
  // A PR is unique by its global githubId, or by owner/repo/number.
  // Using combination of repo full name (as repositoryId string) and PR number.
  // This also implies repositoryId in PRType could be fullName string of repo.
  indexes: [{ fields: { repositoryId: 1, number: 1 }, unique: true }]
});


export const Repository = mongoose.models.Repository || mongoose.model<RepoType>('Repository', repositorySchema);
export const PullRequest = mongoose.models.PullRequest || mongoose.model<PRType>('PullRequest', pullRequestSchema);
export const Analysis = mongoose.models.Analysis || mongoose.model<AnalysisType>('Analysis', analysisSchema);

// Helper to connect Mongoose
let mongooseConnection: Promise<typeof mongoose> | null = null;
export const connectMongoose = async () => {
  if (mongooseConnection) {
    return mongooseConnection;
  }
  mongooseConnection = mongoose.connect(MONGODB_URI!).then((m) => {
    console.log('Mongoose connected.');
    return m;
  }).catch(err => {
    console.error('Mongoose connection error:', err);
    mongooseConnection = null; // Reset on error
    throw err;
  });
  return mongooseConnection;
};

// Ensure Mongoose connection is established when models are first accessed
connectMongoose();
