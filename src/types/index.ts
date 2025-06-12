
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
  type: 'performance' | 'style' | 'bug' | 'feature' | 'optimization' | 'code_smell';
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
  vectorEmbedding?: number[];
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
  id: string;
  pullRequestTitle?: string;
  repositoryName?: string;
  prNumber?: number;
  qualityScore: number;
  securityIssues: number;
  createdAt: Date;
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
  totalIssuesInFile: number; // Total issues in this file from all analyses
  relatedPrIds: string[];
  lastOccurrence: Date;
}

export interface TeamMemberMetric {
  userId: string; // This would ideally be a stable user ID from your User collection
  userName: string; // PR Author login
  userAvatar?: string; // PR Author avatar
  totalAnalyses: number; // Count of PRs they authored that were analyzed
  avgQualityScore: number;
  totalCriticalIssues: number; // Total critical issues in PRs they authored
  totalHighIssues: number; // Total high issues in PRs they authored
}

export interface DashboardData {
  overview: DashboardOverview;
  recentAnalyses: RecentAnalysisItem[];
  qualityTrends: QualityTrendItem[];
  topSecurityIssues: TopIssueItem[];
  topSuggestions: TopIssueItem[];
  securityHotspots: SecurityHotspotItem[];
  teamMetrics: TeamMemberMetric[];
}
