
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import type { Repository as RepoType, PullRequest as PRType, CodeAnalysis as AnalysisType, FileAnalysisItem } from '@/types';

const MONGODB_URI = process.env.MONGODB_URI;
console.log('DEBUG: MONGODB_URI being used by mongodb.ts:', MONGODB_URI); 

if (!MONGODB_URI || MONGODB_URI.trim() === "" || !(MONGODB_URI.startsWith("mongodb://") || MONGODB_URI.startsWith("mongodb+srv://"))) {
  throw new Error('CRITICAL ERROR: The MONGODB_URI environment variable is not defined, is empty, or has an invalid scheme. Please define it in your .env (or .env.local) file with your actual MongoDB connection string. It must start with "mongodb://" or "mongodb+srv://". Current value: ' + MONGODB_URI);
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
  userId: { type: String, required: true }, 
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

const securityIssueSubSchema = new mongoose.Schema({
  type: { type: String }, 
  severity: String,
  title: String,
  description: String,
  file: String,
  line: Number,
  suggestion: String,
  cwe: String,
}, { _id: false });

const suggestionSubSchema = new mongoose.Schema({
  type: { type: String }, 
  priority: String,
  title: String,
  description: String,
  file: String,
  line: Number,
  codeExample: String,
}, { _id: false });

const codeAnalysisMetricsSubSchema = new mongoose.Schema({
  linesOfCode: Number,
  cyclomaticComplexity: Number,
  cognitiveComplexity: Number,
  duplicateBlocks: Number,
}, { _id: false });

const fileAnalysisItemSchema = new mongoose.Schema<FileAnalysisItem>({
  filename: String,
  qualityScore: Number,
  complexity: Number,
  maintainability: Number,
  securityIssues: [securityIssueSubSchema],
  suggestions: [suggestionSubSchema],
  metrics: codeAnalysisMetricsSubSchema,
  aiInsights: String,
  vectorEmbedding: { type: [Number], default: undefined }, // Added for per-file embedding
}, { _id: false });


const analysisSchema = new mongoose.Schema<AnalysisType>({
  pullRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PullRequest', required: true },
  qualityScore: Number,
  complexity: Number,
  maintainability: Number,
  securityIssues: [securityIssueSubSchema],
  suggestions: [suggestionSubSchema],
  metrics: codeAnalysisMetricsSubSchema,
  aiInsights: String,
  fileAnalyses: [fileAnalysisItemSchema], // Store individual file results
}, { timestamps: true });


const pullRequestSchema = new mongoose.Schema<PRType>({
  repositoryId: { type: String, required: true }, 
  githubId: { type: Number, required: true },
  number: { type: Number, required: true },
  title: String,
  body: String,
  state: String, 
  author: {
    login: String,
    avatar: String,
  },
  files: [codeFileSchema],
  analysis: { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' },
  userId: String, 
}, { 
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }, 
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
    mongooseConnection = null; 
    throw err;
  });
  return mongooseConnection;
};

connectMongoose();
