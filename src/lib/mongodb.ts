
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import type { Repository as RepoType, PullRequest as PRType, CodeAnalysis as AnalysisType, FileAnalysisItem, AdminUserView as AdminUserViewType } from '@/types';

const MONGODB_URI = process.env.MONGODB_URI;
console.log('DEBUG: MONGODB_URI being used by mongodb.ts:', MONGODB_URI); 

// IMPORTANT: If you see the error below in your console, it means you MUST set your MONGODB_URI in the .env file.
// The .env file is in the root of your project. Open it and replace the placeholder value.
if (!MONGODB_URI || MONGODB_URI.trim() === "" || !(MONGODB_URI.startsWith("mongodb://") || MONGODB_URI.startsWith("mongodb+srv://"))) {
  throw new Error('CRITICAL CONFIGURATION ERROR: The MONGODB_URI environment variable is not defined, is empty, or has an invalid scheme. Please define it in your .env (or .env.local) file with your actual MongoDB connection string. It must start with "mongodb://" or "mongodb+srv://". Current value: "' + MONGODB_URI + '". The application cannot start without this.');
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongooseConnection: Promise<typeof mongoose> | null | undefined;
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

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  emailVerified: Date,
  image: String,
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  accounts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account' }],
  sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
}, { timestamps: true });

const accountSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: String,
    provider: String,
    providerAccountId: String,
    refresh_token: String,
    access_token: String,
    expires_at: Number,
    token_type: String,
    scope: String,
    id_token: String,
    session_state: String,
});
accountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });


const sessionSchema = new mongoose.Schema({
    sessionToken: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expires: Date,
});

const verificationTokenSchema = new mongoose.Schema({
    identifier: String,
    token: { type: String, unique: true },
    expires: Date,
});
verificationTokenSchema.index({ identifier: 1, token: 1 }, { unique: true });


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
  type: { type: String, enum: ['vulnerability', 'warning', 'info'] }, 
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'] },
  title: String,
  description: String,
  file: String,
  line: Number,
  suggestion: String, 
  cwe: String,
}, { _id: false });

const suggestionSubSchema = new mongoose.Schema({
  type: { type: String, enum: ['performance', 'style', 'bug', 'feature', 'optimization', 'code_smell'] }, 
  priority: { type: String, enum: ['high', 'medium', 'low'] },
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
  vectorEmbedding: { type: [Number], default: undefined }, 
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
  fileAnalyses: [fileAnalysisItemSchema], 
}, { timestamps: true });


const pullRequestSchema = new mongoose.Schema<PRType>({
  repositoryId: { type: String, required: true }, 
  githubId: { type: Number, required: true },
  number: { type: Number, required: true },
  title: String,
  body: String,
  state: { type: String, enum: ['open', 'closed', 'merged'] }, 
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


export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const VerificationToken = mongoose.models.VerificationToken || mongoose.model('VerificationToken', verificationTokenSchema);

export const Repository = mongoose.models.Repository || mongoose.model<RepoType>('Repository', repositorySchema);
export const PullRequest = mongoose.models.PullRequest || mongoose.model<PRType>('PullRequest', pullRequestSchema);
export const Analysis = mongoose.models.Analysis || mongoose.model<AnalysisType>('Analysis', analysisSchema);


export const connectMongoose = async () => {
  if (global._mongooseConnection) {
    return global._mongooseConnection;
  }
  if (mongoose.connections[0].readyState) {
    global._mongooseConnection = Promise.resolve(mongoose);
    return global._mongooseConnection;
  }
  
  global._mongooseConnection = mongoose.connect(MONGODB_URI!).then((m) => {
    console.log('Mongoose connected.');
    return m;
  }).catch(err => {
    console.error('Mongoose connection error:', err);
    global._mongooseConnection = null; 
    throw err;
  });
  return global._mongooseConnection;
};

connectMongoose();
