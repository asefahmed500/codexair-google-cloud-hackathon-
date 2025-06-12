

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
  repositoryId: string | Repository; // Can be ObjectId string or populated Repository object
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
  pullRequestId: string | PullRequest; // Can be ObjectId string or populated PullRequest object
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
  id: string; // analysisId
  pullRequestTitle?: string;
  repositoryName?: string; // This will be fullName like "owner/repo"
  prNumber?: number;
  owner?: string; // Extracted owner for link construction
  repo?: string;  // Extracted repoName for link construction
  qualityScore: number;
  securityIssues: number; // Count of critical/high
  createdAt: Date; // Analysis creation date
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
  owner: string; // From populated PR details
  repoName: string; // From populated PR details
  prNumber: number; // From populated PR details
  prTitle: string; // From populated PR details
  prAuthorLogin: string; // From populated PR details author.login
  prCreatedAt: Date; // From populated PR details createdAt
  filename: string; // Filename within that PR's analysis
  aiInsights: string; // AI insights for that specific file in the historical analysis
  score: number; // Similarity score from vector search
}

// Type for user data displayed in admin panel
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
  prAuthor: string;
  analysisDate: Date;
  qualityScore: number | null;
  criticalIssuesCount: number;
  highIssuesCount: number;
  analysisId?: string; 
}

export interface AuditLogEntry {
  _id: string;
  timestamp: Date;
  adminUserId?: string; // Could be populated User object later
  adminUserEmail: string;
  action: string;
  targetUserId?: string; // Could be populated User object later
  targetUserEmail?: string;
  details?: any; // Store arbitrary JSON details
}

