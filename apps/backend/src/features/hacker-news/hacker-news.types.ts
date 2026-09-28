export type HnSource = 'top' | 'new' | 'ask' | 'show';
export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface HnResearchConfig {
  sources: HnSource[];
  depth: ResearchDepth;
  monitorId?: string;
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

export interface TriageDecision {
  storyId: number;
  priority: 'high' | 'medium' | 'low';
  investigate: boolean;
  followExternalLink: boolean;
  likelyTopics: string[];
  topicKey: string;
  reason: string;
}

export interface ExternalPageResult {
  status: 'success' | 'unusable' | 'failed' | 'empty' | 'not-requested' | 'no-external-url';
  markdown?: string;
  error?: string;
  usabilityReason?: string;
  prevalidationWarning?: string;
}

export interface DiscussionClaim {
  claim: string;
  supportingCommentIds: number[];
}

export interface StoryAnalysis {
  primaryTopic: string;
  sourceUsability: 'usable' | 'unusable' | 'not-applicable';
  sourceUsabilityReason?: string | null;
  subtopics: string[];
  technologies: string[];
  topicKey: string;
  issueKeys: string[];
  sourceSummary: string;
  discussionSummary: string;
  discussionClaims: DiscussionClaim[];
  whyDevelopersCare: string;
  problems: string[];
  questions: string[];
  contentOpportunities: Array<{ title: string; rationale: string }>;
}

export type StoryEvidenceBasis = 'source-backed' | 'source-and-discussion' | 'discussion-only' | 'hn-submission-only';

export interface ResearchStoryRecord {
  story: HnStory;
  triage: TriageDecision;
  comments: HnComment[];
  evidenceBasis: StoryEvidenceBasis;
  external: {
    status: ExternalPageResult['status'];
    markdownChars?: number;
    error?: string;
    usabilityReason?: string;
  };
  analysis: StoryAnalysis;
}
