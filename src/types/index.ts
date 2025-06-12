
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
  suggestion: string; // Can be used for the "fix" or code example
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
  aiInsights: string; // This field will store the auto-generated summary
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

export interface DashboardData {
  overview: DashboardOverview;
  recentAnalyses: RecentAnalysisItem[];
  qualityTrends: QualityTrendItem[];
  topSecurityIssues: TopIssueItem[];
  topSuggestions: TopIssueItem[];
  securityHotspots: SecurityHotspotItem[];
  teamMetrics: TeamMemberMetric[];
}

// Type for vector search results
export interface SimilarCodeResult {
  originalDocId: string; // Analysis document ID
  pullRequestId: string;
  prInfo?: { // Populated by $lookup
    title: string;
    number: number;
    authorLogin: string;
    createdAt: Date;
  };
  filename: string;
  qualityScore: number;
  aiInsights: string; // For the specific file
  score: number; // Vector search similarity score
}
