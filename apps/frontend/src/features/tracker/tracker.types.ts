export type HnSource = 'top' | 'new' | 'ask' | 'show';
export type ResearchDepth = 'quick' | 'standard' | 'deep';
export type MonitorCadence = 'custom-hours' | 'daily' | 'weekly' | 'monthly';
export type StoryEvidenceBasis =
  | 'source-backed'
  | 'source-and-discussion'
  | 'discussion-only'
  | 'hn-submission-only'
  // Legacy saved runs:
  | 'source-only'
  | 'hn-only';
export type FindingEvidenceBasis =
  | 'source-backed'
  | 'discussion-only'
  | 'hn-submission-only'
  | 'source-and-discussion'
  // Legacy saved runs:
  | 'mixed';

export interface FindingEvidenceProvenance {
  sourceStoryIds: number[];
  discussionStoryIds: number[];
  submissionStoryIds: number[];
}

export interface ResearchConfig {
  sources: HnSource[];
  depth: ResearchDepth;
  monitorId?: string;
  monitorName?: string;
}

export interface HnStory {
  id: number;
  title: string;
  url?: string;
  hnUrl: string;
  by: string;
  time: number;
  score: number;
  descendants: number;
  text?: string;
  kids: number[];
  sources: HnSource[];
  sourceRanks: Partial<Record<HnSource, number>>;
}

export interface HnComment {
  id: number;
  by?: string;
  time?: number;
  text: string;
  depth: number;
  parent?: number;
}

export interface StoryAnalysis {
  primaryTopic: string;
  sourceUsability?: 'usable' | 'unusable' | 'not-applicable';
  sourceUsabilityReason?: string | null;
  subtopics: string[];
  technologies: string[];
  topicKey?: string;
  issueKeys?: string[];
  trendKeys?: string[]; // legacy saved runs
  sourceSummary: string;
  discussionSummary: string;
  discussionClaims?: Array<{ claim: string; supportingCommentIds: number[] }>;
  whyDevelopersCare: string;
  problems: string[];
  questions: string[];
  contentOpportunities: Array<{ title: string; rationale: string }>;
}

export interface ResearchStoryRecord {
  story: HnStory;
  triage: {
    storyId: number;
    priority: 'high' | 'medium' | 'low';
    investigate: boolean;
    followExternalLink: boolean;
    likelyTopics: string[];
    topicKey?: string;
    reason: string;
  };
  comments: HnComment[];
  evidenceBasis?: StoryEvidenceBasis;
  external: {
    status: 'success' | 'unusable' | 'failed' | 'empty' | 'not-requested' | 'no-external-url';
    markdownChars?: number;
    error?: string;
    usabilityReason?: string;
  };
  analysis: StoryAnalysis;
}

export interface HnReport {
  executiveSummary: string;
  trends: Array<{ title: string; description: string; storyIds: number[]; evidenceBasis?: FindingEvidenceBasis; evidenceProvenance?: FindingEvidenceProvenance; topicKey?: string; trendKey?: string }>;
  technologies: Array<{ name: string; signal: string; storyIds: number[]; evidenceBasis?: FindingEvidenceBasis; evidenceProvenance?: FindingEvidenceProvenance }>;
  developerProblems: Array<{ problem: string; detail: string; storyIds: number[]; evidenceBasis?: FindingEvidenceBasis; evidenceProvenance?: FindingEvidenceProvenance }>;
  contentOpportunities: Array<{ title: string; angle: string; storyIds: number[]; evidenceBasis?: FindingEvidenceBasis; evidenceProvenance?: FindingEvidenceProvenance }>;
}

export interface SourceEnrichmentWarning {
  code: 'decodo-authentication-failed';
  requestedPages: number;
}

export interface ResearchStats {
  candidateStories: number;
  selectedStories: number;
  sourceContributions?: Partial<
    Record<HnSource, { candidateStories: number; investigatedStories: number }>
  >;
  commentsAnalyzed: number;
  externalPagesRequested: number;
  externalPagesScraped: number; // legacy-compatible: successfully retrieved pages, including unusable content
  externalPagesRetrieved?: number;
  externalPagesUsable?: number;
  externalPagesUnusable?: number;
  externalPagesFailed: number;
  sourceEnrichmentWarning?: SourceEnrichmentWarning;
  llmCalls?: number;
  llmInputTokens?: number;
  llmOutputTokens?: number;
  llmTotalTokens?: number;
}

export interface ResearchResult {
  id: string;
  generatedAt: string;
  sourceUrls: string[];
  plan: ResearchConfig;
  stories: ResearchStoryRecord[];
  stats: ResearchStats;
  report: HnReport;
}

export interface StoredQuery {
  _id: string;
  prompt: string;
  plan: ResearchConfig;
  stories?: ResearchStoryRecord[];
  stats: ResearchStats;
  report: HnReport;
  monitorId?: string;
  monitorName?: string;
  runType?: 'manual' | 'scheduled' | 'manual-monitor';
  createdAt: string;
}

export interface SavedMonitor {
  _id: string;
  name: string;
  plan: ResearchConfig;
  cadence: MonitorCadence;
  intervalHours?: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastQueryId?: string;
  lastError?: string;
  currentRunStartedAt?: string;
  createdAt: string;
}
