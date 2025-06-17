
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import type { Repository as RepoType, PullRequest as PRType, CodeAnalysis as AnalysisType, FileAnalysisItem, AdminUserView as AdminUserViewType, AuditLogEntry as AuditLogType, RepositoryScanResult, ContactMessage as ContactMessageType } from '@/types';

const RAW_MONGODB_URI_FROM_ENV = process.env.MONGODB_URI;

const MONGODB_URI = RAW_MONGODB_URI_FROM_ENV;

if (!MONGODB_URI || MONGODB_URI.trim() === "" || !(MONGODB_URI.startsWith("mongodb://") || MONGODB_URI.startsWith("mongodb+srv://"))) {
  console.error('------------------------------------------------------------------------------------------');
  console.error('CRITICAL CONFIGURATION ERROR: MONGODB_URI IS MISSING OR INVALID IN YOUR .env FILE!');
  console.error('------------------------------------------------------------------------------------------');
  console.error('Please ensure your .env file (in the project root) contains a valid MONGODB_URI.');
  console.error('It must start with "mongodb://" or "mongodb+srv://".');
  console.error(`Current value being checked: "${MONGODB_URI}" (Raw value from env: "${RAW_MONGODB_URI_FROM_ENV}")`);
  console.error('The application cannot start without a valid MongoDB connection string.');
  console.error('Example: MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/yourDatabaseName');
  console.error('------------------------------------------------------------------------------------------');
  throw new Error('CRITICAL CONFIGURATION ERROR: Invalid or missing MONGODB_URI. Check console & .env file.');
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
  email: { type: String, unique: true, required: function(this: any) { return !!this.email; } }, // Email is required if provided
  emailVerified: Date,
  image: String,
  role: { type: String, default: 'user', enum: ['user', 'admin'], required: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  accounts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account' }],
  sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  // New fields for GitHub repository count
  lastKnownTotalGitHubRepos: Number,
  lastGitHubRepoCountSync: Date,
}, { timestamps: true });

const accountSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    provider: { type: String, required: true },
    providerAccountId: { type: String, required: true },
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
    sessionToken: { type: String, unique: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expires: { type: Date, required: true },
});

const verificationTokenSchema = new mongoose.Schema({
    identifier: { type: String, required: true },
    token: { type: String, unique: true, required: true },
    expires: { type: Date, required: true },
});
verificationTokenSchema.index({ identifier: 1, token: 1 }, { unique: true });


const repositorySchema = new mongoose.Schema<RepoType>({
  name: { type: String, required: true },
  fullName: { type: String, required: true, index: true },
  owner: { type: String, required: true },
  githubId: { type: Number, unique: true, required: true, index: true },
  language: String,
  stars: Number,
  isPrivate: Boolean,
  userId: { type: String, required: true, index: true }, 
}, { timestamps: true });
repositorySchema.index({ userId: 1, updatedAt: -1 }); 

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
  resolved: { type: Boolean, default: false }, // Added for "Mark as Resolved"
}, { _id: false });

const suggestionSubSchema = new mongoose.Schema({
  type: { type: String, enum: ['performance', 'style', 'bug', 'feature', 'optimization', 'code_smell'] },
  priority: { type: String, enum: ['high', 'medium', 'low'] },
  title: String,
  description: String,
  file: String,
  line: Number,
  codeExample: String,
  resolved: { type: Boolean, default: false }, // Added for "Mark as Resolved"
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
  pullRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PullRequest', required: true, index: true },
  qualityScore: Number,
  complexity: Number,
  maintainability: Number,
  securityIssues: [securityIssueSubSchema],
  suggestions: [suggestionSubSchema],
  metrics: codeAnalysisMetricsSubSchema,
  aiInsights: String, 
  fileAnalyses: [fileAnalysisItemSchema],
}, { timestamps: true });
analysisSchema.index({ createdAt: -1 }); 


const pullRequestSchema = new mongoose.Schema<PRType>({
  repositoryId: { type: String, required: true, index: true }, 
  owner: { type: String, required: true }, 
  repoName: { type: String, required: true }, 
  githubId: { type: Number, required: true, index: true },
  number: { type: Number, required: true },
  title: String,
  body: String,
  state: { type: String, enum: ['open', 'closed', 'merged'] },
  branch: String, // Added branch field
  author: {
    login: String,
    avatar: String,
  },
  files: [codeFileSchema],
  analysis: { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis' },
  userId: { type: String, required: true, index: true }, 
  analysisStatus: { type: String, enum: ['analyzed', 'pending', 'failed', 'not_started'], default: 'not_started' },
  qualityScore: { type: Number, default: null },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  indexes: [{ fields: { repositoryId: 1, number: 1 }, unique: true }]
});

const repositoryScanSchema = new mongoose.Schema<RepositoryScanResult>({
  repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
  userId: { type: String, required: true, index: true },
  owner: { type: String, required: true },
  repoName: { type: String, required: true },
  branchAnalyzed: { type: String, required: true },
  commitShaAnalyzed: { type: String, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], required: true },
  qualityScore: Number,
  complexity: Number,
  maintainability: Number,
  securityIssues: [securityIssueSubSchema],
  suggestions: [suggestionSubSchema],
  metrics: codeAnalysisMetricsSubSchema, // Aggregated metrics for the scan
  summaryAiInsights: String, // Overall summary for the repository scan
  fileAnalyses: [fileAnalysisItemSchema], // Analysis for each file scanned
}, { timestamps: true });
repositoryScanSchema.index({ repositoryId: 1, createdAt: -1 });


const AUDIT_LOG_ACTIONS = [
  'USER_ROLE_CHANGED',
  'USER_STATUS_CHANGED_ACTIVE',
  'USER_STATUS_CHANGED_SUSPENDED',
  'ADMIN_ANALYSIS_SUMMARY_REPORT_FETCHED',
] as const;
export type AuditLogActionType = typeof AUDIT_LOG_ACTIONS[number];

const auditLogSchemaDefinition: Record<keyof Omit<AuditLogType, '_id'>, any> = {
  timestamp: { type: Date, default: Date.now, required: true },
  adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminUserEmail: { type: String, required: true },
  action: { type: String, required: true, enum: AUDIT_LOG_ACTIONS },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  targetUserEmail: { type: String, required: false },
  details: { type: mongoose.Schema.Types.Mixed, required: false },
};

const auditLogSchema = new mongoose.Schema(auditLogSchemaDefinition, { timestamps: false }); 
auditLogSchema.index({ timestamp: -1 }); 
auditLogSchema.index({ adminUserId: 1 });
auditLogSchema.index({ action: 1 });

const contactMessageSchema = new mongoose.Schema<ContactMessageType>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  message: { type: String, required: true, trim: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ isRead: 1, createdAt: -1 });


export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const VerificationToken = mongoose.models.VerificationToken || mongoose.model('VerificationToken', verificationTokenSchema);

export const Repository = mongoose.models.Repository || mongoose.model<RepoType>('Repository', repositorySchema);
export const PullRequest = mongoose.models.PullRequest || mongoose.model<PRType>('PullRequest', pullRequestSchema);
export const Analysis = mongoose.models.Analysis || mongoose.model<AnalysisType>('Analysis', analysisSchema);
export const RepositoryScan = mongoose.models.RepositoryScan || mongoose.model<RepositoryScanResult>('RepositoryScan', repositoryScanSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model<AuditLogType>('AuditLog', auditLogSchema);
export const ContactMessage = mongoose.models.ContactMessage || mongoose.model<ContactMessageType>('ContactMessage', contactMessageSchema);


export const connectMongoose = async () => {
  if (global._mongooseConnection) {
    // console.log('[MongoDB Setup] Using cached Mongoose connection promise.');
    return global._mongooseConnection;
  }
  if (mongoose.connections[0].readyState) {
    // console.log('[MongoDB Setup] Mongoose connection already established.');
    global._mongooseConnection = Promise.resolve(mongoose);
    return global._mongooseConnection;
  }

  console.log('[MongoDB Setup] No active Mongoose connection. Attempting to connect...');
  global._mongooseConnection = mongoose.connect(MONGODB_URI!).then((m) => {
    console.log('[MongoDB Setup] Mongoose connected successfully via mongoose.connect().');
    return m;
  }).catch(err => {
    console.error('[MongoDB Setup] Mongoose connection error during mongoose.connect():', err);
    global._mongooseConnection = null; // Clear the promise on error
    throw err; // Re-throw to indicate connection failure
  });
  return global._mongooseConnection;
};

// Attempt to connect Mongoose on module load to catch issues early if not already handled by clientPromise.
// This also helps ensure models are registered.
connectMongoose().catch(err => {
    console.error("[MongoDB Setup] Initial Mongoose connection attempt on module load failed:", err.message);
    // Depending on the error, you might want to exit or handle differently.
    // For now, just logging. The app will likely fail later if DB isn't up.
});
    
    
    
