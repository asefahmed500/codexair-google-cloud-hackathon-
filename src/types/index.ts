
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
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged'; // GitHub uses more statuses
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
  content?: string;
}

export interface PullRequest {
  _id: string;
  repositoryId: string; // This should refer to the _id of the Repository document
  owner: string; // For easier linking and display
  repoName: string; // For easier linking and display
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
  analysis?: CodeAnalysis | string; // Can be ObjectId string or populated object
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
  pullRequestId: string; // This should be the _id of the PullRequest document
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

export interface SimilarCodeResult {
  analysisId: string; // _id of the Analysis document where similar code was found
  owner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  prAuthorLogin: string;
  prCreatedAt: Date;
  filename: string; // Filename within that PR's analysis
  aiInsights: string; // AI insights for that specific file
  score: number; // Similarity score from vector search
}

// Type for user data displayed in admin panel
export interface AdminUserView {
  _id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

