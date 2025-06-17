
import type { AuditLogActionType } from '@/lib/mongodb';

export interface Repository {
  _id: string;
  name: string;
  fullName: string;
  owner: string;
  githubId: number;
  language: string;
  stars: number;
  isPrivate: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CodeFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged'; 
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
  content?: string; 
}

export interface PullRequest {
  _id: string;
  repositoryId: string | Repository; 
  owner: string; 
  repoName: string; 
  githubId: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  branch?: string; 
  author: {
    login: string;
    avatar: string;
  };
  files: CodeFile[];
  createdAt: Date;
  updatedAt: Date;
  analysis?: CodeAnalysis | string; 
  userId?: string;
  analysisStatus?: 'analyzed' | 'pending' | 'failed' | 'not_started';
  qualityScore?: number | null;
}

export interface SecurityIssue {
  type: 'vulnerability' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file: string;
  line?: number;
  suggestion: string; 
  cwe?: string;
  resolved?: boolean; // Added for "Mark as Resolved"
}

export interface Suggestion {
  type: 'performance' | 'style' | 'bug' | 'feature' | 'optimization' | 'code_smell';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file: string;
  line?: number;
  codeExample?: string;
  resolved?: boolean; // Added for "Mark as Resolved"
}

export interface CodeAnalysisMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  duplicateBlocks: number;
}
export interface FileAnalysisItem {
  filename: string;
  qualityScore: number;
  complexity: number;
  maintainability: number;
  securityIssues: SecurityIssue[];
  suggestions: Suggestion[];
  metrics: CodeAnalysisMetrics;
  aiInsights: string; 
  vectorEmbedding?: number[];
}

export interface CodeAnalysis {
  _id: string;
  pullRequestId: string | PullRequest; 
  qualityScore: number;
  complexity: number;
  maintainability: number;
  securityIssues: SecurityIssue[];
  suggestions: Suggestion[];
  metrics: CodeAnalysisMetrics;
  aiInsights: string; 
  fileAnalyses?: FileAnalysisItem[];
  createdAt: Date;
}

export interface RepositoryScanResult {
  _id: string;
  repositoryId: string | Repository;
  userId: string;
  owner: string;
  repoName: string;
  branchAnalyzed: string;
  commitShaAnalyzed: string;
  status: 'pending' | 'completed' | 'failed';
  qualityScore: number;
  complexity: number;
  maintainability: number;
  securityIssues: SecurityIssue[];
  suggestions: Suggestion[];
  metrics: CodeAnalysisMetrics; // Aggregated metrics
  summaryAiInsights: string; // Overall summary for the repository scan
  fileAnalyses: FileAnalysisItem[];
  createdAt: Date;
  updatedAt: Date;
}


export interface TopIssueItem {
  title: string;
  count: number;
  severity?: SecurityIssue['severity'];
  priority?: Suggestion['priority'];
  type?: Suggestion['type'] | SecurityIssue['type'];
}

export interface DashboardOverview {
  totalAnalyses: number;
  avgQualityScore: number;
  securityIssuesCount: number;
  trendsUp: boolean;
}

export interface RecentAnalysisItem {
  id: string; // analysisId or scanId
  type: 'pr' | 'repo_scan'; 
  pullRequestTitle?: string; 
  repositoryName: string; 
  prNumber?: number; 
  owner: string; 
  repo: string;  
  qualityScore: number;
  securityIssues: number; 
  createdAt: Date; 
  branchAnalyzed?: string; 
  commitShaAnalyzed?: string; 
}

export interface QualityTrendItem {
  date: string;
  quality: number;
  count: number;
}

export interface SecurityHotspotItem {
  filename: string;
  criticalIssues: number;
  highIssues: number;
  totalIssuesInFile: number;
  relatedPrIds: string[]; 
  lastOccurrence: Date;
}

export interface TeamMemberMetric {
  userId: string; 
  userName: string; 
  userAvatar?: string; 
  totalAnalyses: number; 
  avgQualityScore: number;
  totalCriticalIssues: number; 
  totalHighIssues: number; 
}

export interface ConnectedRepositoryItem {
  _id: string;
  fullName: string;
  language: string | null;
  owner: string;
  name: string;
  updatedAt: Date; 
}

export interface DashboardData {
  overview: DashboardOverview;
  recentAnalyses: RecentAnalysisItem[];
  qualityTrends: QualityTrendItem[];
  topSecurityIssues: TopIssueItem[];
  topSuggestions: TopIssueItem[];
  securityHotspots: SecurityHotspotItem[];
  teamMetrics: TeamMemberMetric[];
  connectedRepositories: ConnectedRepositoryItem[]; 
}

export interface SimilarCodeResult {
  analysisId: string; 
  owner: string; 
  repoName: string; 
  filename: string; 
  aiInsights: string; 
  score: number; 
  searchResultType: 'pr_analysis' | 'repo_scan'; 
  prNumber?: number; 
  prTitle?: string; 
  prAuthorLogin?: string; 
  prCreatedAt?: Date; 
  scanBranch?: string;
  scanCommitSha?: string;
  scanCreatedAt?: Date;
}

export interface AdminUserView {
  _id: string;
  name?: string | null;
  email?: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisReportItem {
  prId: string; 
  prNumber: number;
  prTitle: string;
  repositoryFullName: string; 
  owner: string; 
  repoName: string; 
  prAuthor: string;
  analysisDate: Date | null; 
  qualityScore: number | null;
  criticalIssuesCount: number;
  highIssuesCount: number;
  analysisId?: string; 
}

export interface AuditLogEntry {
  _id: string;
  timestamp: Date;
  adminUserId: string; 
  adminUserEmail: string; 
  action: AuditLogActionType; 
  targetUserId?: string; 
  targetUserEmail?: string; 
  details?: any; 
}

export interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}
