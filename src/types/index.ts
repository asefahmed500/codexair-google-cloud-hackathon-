
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
  status: 'added' | 'modified' | 'removed';
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
  content?: string;
}

export interface PullRequest {
  _id: string;
  repositoryId: string; // Could be ObjectId if referencing local Repository collection
  githubId: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  author: {
    login: string;
    avatar: string;
  };
  files: CodeFile[];
  createdAt: Date; // GitHub's created_at
  updatedAt: Date; // GitHub's updated_at
  analysis?: CodeAnalysis | string; // string for ObjectId if populated, CodeAnalysis if fully populated
  userId?: string; // Added to associate PR with user if needed
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
}

export interface Suggestion {
  type: 'performance' | 'style' | 'bug' | 'feature';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file: string;
  line?: number;
  codeExample?: string;
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
}

export interface CodeAnalysis {
  _id: string;
  pullRequestId: string; // ObjectId referencing PullRequest
  qualityScore: number;
  complexity: number;
  maintainability: number;
  securityIssues: SecurityIssue[];
  suggestions: Suggestion[];
  metrics: CodeAnalysisMetrics;
  aiInsights: string;
  fileAnalyses?: FileAnalysisItem[]; // Store individual file results if needed
  createdAt: Date;
}

export interface DashboardOverview {
  totalAnalyses: number;
  avgQualityScore: number;
  securityIssuesCount: number;
  trendsUp: boolean;
}

export interface RecentAnalysisItem {
  id: string;
  pullRequestTitle?: string;
  repositoryName?: string;
  qualityScore: number;
  securityIssues: number;
  createdAt: Date;
}

export interface QualityTrendItem {
  date: string;
  quality: number;
  count: number;
}

export interface DashboardData {
  overview: DashboardOverview;
  recentAnalyses: RecentAnalysisItem[];
  qualityTrends: QualityTrendItem[];
}
