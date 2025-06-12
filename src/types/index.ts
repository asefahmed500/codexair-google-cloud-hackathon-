
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
  repositoryId: string; 
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
  createdAt: Date; 
  updatedAt: Date; 
  analysis?: CodeAnalysis | string; 
  userId?: string; 
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
  vectorEmbedding?: number[]; // Added for per-file embedding
}

export interface CodeAnalysis {
  _id: string;
  pullRequestId: string; 
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

export interface TopIssueItem {
  title: string;
  count: number;
  severity?: SecurityIssue['severity']; // Optional, for security issues
  priority?: Suggestion['priority']; // Optional, for suggestions
  type?: Suggestion['type'] | SecurityIssue['type'];
}

export interface DashboardOverview {
  totalAnalyses: number;
  avgQualityScore: number;
  securityIssuesCount: number; // Total critical/high issues
  trendsUp: boolean;
}

export interface RecentAnalysisItem {
  id: string;
  pullRequestTitle?: string;
  repositoryName?: string;
  prNumber?: number; // Added prNumber
  qualityScore: number;
  securityIssues: number; // Count of issues for this specific analysis
  createdAt: Date;
}

export interface QualityTrendItem {
  date: string; // Format: YYYY-MM-DD
  quality: number;
  count: number; // Number of analyses on that date
}

export interface DashboardData {
  overview: DashboardOverview;
  recentAnalyses: RecentAnalysisItem[];
  qualityTrends: QualityTrendItem[];
  topSecurityIssues: TopIssueItem[];
  topSuggestions: TopIssueItem[];
}
