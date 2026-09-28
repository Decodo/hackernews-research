import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DecodoService } from '../decodo/decodo.service';
import { HackerNewsService } from '../hacker-news/hacker-news.service';
import type {
  ExternalPageResult,
  HnComment,
  HnResearchConfig,
  HnSource,
  HnStory,
  ResearchDepth,
  ResearchStoryRecord,
  StoryAnalysis,
  TriageDecision,
} from '../hacker-news/hacker-news.types';
import { LlmService } from '../llm/llm.service';
import type { LlmResponse } from '../llm/llm.types';
import { QueriesService } from '../queries/queries.service';
import type { RunResearchDto } from './dto/run-research.dto';

export type ResearchProgressStage =
  | 'collecting'
  | 'triaging'
  | 'discussing'
  | 'scraping'
  | 'analyzing'
  | 'saving';

type ResearchContext = {
  runType?: 'manual' | 'scheduled' | 'manual-monitor';
  monitorId?: string;
  monitorName?: string;
  onProgress?: (stage: ResearchProgressStage) => void;
};

type DepthProfile = {
  candidateLimit: number;
  selectedItemLimit: number;
  externalPageLimit: number;
  analysisComments: number;
  commentDepth: number;
  markdownCharLimit: number;
  triageOutputTokens: number;
  storyAnalysisOutputTokens: number;
  synthesisOutputTokens: number;
  storyAnalysisConcurrency: number;
  excludeZeroCommentHnOnly?: boolean;
};

type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

type ThemeCandidate = {
  topicKey: string;
  storyIds: number[];
  issueKeys: string[];
  storyIssues: Array<{ storyId: number; issueKeys: string[] }>;
};

type ExternalMarkdownValidation = {
  verdict: 'usable' | 'suspicious' | 'unusable';
  reason?: string;
};

type SourceContributionCounts = Partial<
  Record<HnSource, { candidateStories: number; investigatedStories: number }>
>;

const DEFAULT_SOURCES: HnSource[] = ['top', 'new', 'ask', 'show'];

const DEPTH_PROFILES: Record<ResearchDepth, DepthProfile> = {
  quick: {
    candidateLimit: 30,
    selectedItemLimit: 5,
    externalPageLimit: 5,
    analysisComments: 5,
    commentDepth: 1,
    markdownCharLimit: 12_000,
    triageOutputTokens: 1_500,
    storyAnalysisOutputTokens: 1_400,
    synthesisOutputTokens: 3_200,
    storyAnalysisConcurrency: 3,
    excludeZeroCommentHnOnly: true,
  },
  standard: {
    candidateLimit: 60,
    selectedItemLimit: 10,
    externalPageLimit: 10,
    analysisComments: 8,
    commentDepth: 2,
    markdownCharLimit: 16_000,
    triageOutputTokens: 1_800,
    storyAnalysisOutputTokens: 1_600,
    synthesisOutputTokens: 4_000,
    storyAnalysisConcurrency: 3,
  },
  deep: {
    candidateLimit: 100,
    selectedItemLimit: 16,
    externalPageLimit: 16,
    analysisComments: 12,
    commentDepth: 2,
    markdownCharLimit: 22_000,
    triageOutputTokens: 2_200,
    storyAnalysisOutputTokens: 1_800,
    synthesisOutputTokens: 4_800,
    storyAnalysisConcurrency: 3,
  },
};

const triageResponseSchema = z.object({
  selected: z.array(
    z.object({
      storyId: z.coerce.number().int(),
      priority: z.enum(['high', 'medium', 'low']),
      investigate: z.boolean(),
      likelyTopics: z.array(z.string()).default([]),
      topicKey: z.string(),
      reason: z.string(),
    }),
  ),
});

const storyAnalysisSchema = z.object({
  primaryTopic: z.string(),
  sourceUsability: z.enum(['usable', 'unusable', 'not-applicable']).default('not-applicable'),
  sourceUsabilityReason: z.string().nullable().optional().default(null),
  subtopics: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  topicKey: z.string(),
  issueKeys: z.array(z.string()).default([]),
  sourceSummary: z.string(),
  discussionSummary: z.string(),
  discussionClaims: z
    .array(
      z.object({
        claim: z.string(),
        supportingCommentIds: z.array(z.coerce.number().int()).default([]),
      }),
    )
    .default([]),
  whyDevelopersCare: z.string(),
  problems: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  contentOpportunities: z
    .array(z.object({ title: z.string(), rationale: z.string() }))
    .default([]),
});

const evidenceBasisSchema = z.enum(['source-backed', 'discussion-only', 'hn-submission-only', 'source-and-discussion']);

const findingEvidenceProvenanceSchema = z
  .object({
    sourceStoryIds: z.array(z.coerce.number().int()),
    discussionStoryIds: z.array(z.coerce.number().int()),
    submissionStoryIds: z.array(z.coerce.number().int()),
  })
  .refine(
    (value) =>
      value.sourceStoryIds.length + value.discussionStoryIds.length + value.submissionStoryIds.length > 0,
    { message: 'At least one explicit evidence provenance story ID is required.' },
  );

const GENERIC_TOPIC_KEYS = new Set([
  'ai',
  'api',
  'architecture',
  'approach',
  'approaches',
  'auditable',
  'auditability',
  'classification',
  'classifier',
  'classifiers',
  'code',
  'developer-tools',
  'developers',
  'infrastructure',
  'open-source',
  'programming',
  'reliability',
  'security',
  'software',
  'software-development',
  'systems',
  'tooling',
  'tools',
  'web',
]);

const THEME_ANCHOR_STOPWORDS = new Set([
  'after',
  'also',
  'are',
  'before',
  'between',
  'both',
  'but',
  'can',
  'could',
  'does',
  'for',
  'from',
  'has',
  'have',
  'how',
  'into',
  'its',
  'more',
  'new',
  'not',
  'one',
  'only',
  'other',
  'our',
  'over',
  'same',
  'show',
  'than',
  'that',
  'the',
  'their',
  'this',
  'through',
  'two',
  'via',
  'what',
  'when',
  'where',
  'which',
  'why',
  'will',
  'without',
  'approach',
  'approaches',
  'auditable',
  'auditability',
  'about',
  'agent',
  'agents',
  'ai',
  'and',
  'api',
  'application',
  'applications',
  'architecture',
  'based',
  'benchmark',
  'benchmarking',
  'benchmarks',
  'classification',
  'classifier',
  'classifiers',
  'code',
  'coding',
  'cost',
  'decision',
  'decisions',
  'developer',
  'developers',
  'development',
  'framework',
  'frameworks',
  'explanation',
  'explanations',
  'implementation',
  'javascript',
  'linux',
  'llm',
  'llms',
  'local',
  'model',
  'models',
  'open',
  'output',
  'outputs',
  'pattern',
  'patterns',
  'performance',
  'probabilities',
  'probability',
  'platform',
  'platforms',
  'programming',
  'project',
  'python',
  'react',
  'release',
  'releases',
  'reliability',
  'security',
  'software',
  'source',
  'story',
  'structured',
  'system',
  'systems',
  'technical',
  'technology',
  'tool',
  'tooling',
  'tools',
  'typescript',
  'using',
  'web',
  'windows',
  'with',
  'workflow',
  'workflows',
  'work',
  'working',
  'skill',
  'skills',
  'career',
  'careers',
  'role',
  'roles',
  'productivity',
  'fluency',
]);

const reportSchema = z.object({
  executiveSummary: z.string(),
  trends: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        storyIds: z.array(z.coerce.number().int()),
        evidenceProvenance: findingEvidenceProvenanceSchema,
        topicKey: z.string(),
      }),
    )
    .default([]),
  technologies: z
    .array(
      z.object({
        name: z.string(),
        signal: z.string(),
        storyIds: z.array(z.coerce.number().int()),
        evidenceProvenance: findingEvidenceProvenanceSchema,
      }),
    )
    .default([]),
  developerProblems: z
    .array(
      z.object({
        problem: z.string(),
        detail: z.string(),
        storyIds: z.array(z.coerce.number().int()),
        evidenceProvenance: findingEvidenceProvenanceSchema,
      }),
    )
    .default([]),
  contentOpportunities: z
    .array(
      z.object({
        title: z.string(),
        angle: z.string(),
        storyIds: z.array(z.coerce.number().int()),
        evidenceProvenance: findingEvidenceProvenanceSchema,
      }),
    )
    .default([]),
});

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }

    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private readonly hn: HackerNewsService,
    private readonly decodo: DecodoService,
    private readonly llm: LlmService,
    private readonly queries: QueriesService,
  ) {}

  async run(dto: RunResearchDto, context: ResearchContext = {}) {
    const config: HnResearchConfig = {
      sources: dto.sources?.length ? dto.sources : DEFAULT_SOURCES,
      depth: dto.depth ?? 'standard',
      monitorId: dto.monitorId,
    };
    const profile = DEPTH_PROFILES[config.depth];
    const usage: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0 };

    context.onProgress?.('collecting');
    const candidates = await this.hn.collectStories(config.sources, profile.candidateLimit);
    if (!candidates.length) throw new NotFoundException('Hacker News returned no usable stories.');

    context.onProgress?.('triaging');
    const triageResult = await this.triageStories(config, profile, candidates);
    this.addUsage(usage, triageResult.usage);
    const selected = this.selectStories(candidates, triageResult.data, profile);
    if (!selected.length) throw new NotFoundException('The research triage found no stories worth investigating.');

    context.onProgress?.('discussing');
    const commentMap = new Map<number, HnComment[]>();
    await mapWithConcurrency(selected, 5, async ({ story }) => {
      const comments = await this.hn.fetchComments(story, profile.analysisComments, profile.commentDepth);
      commentMap.set(story.id, comments);
      return comments.length;
    });

    context.onProgress?.('scraping');
    const processed = await this.scrapeAndAnalyzeStories(
      selected,
      commentMap,
      profile,
      () => context.onProgress?.('analyzing'),
    );
    this.addUsage(usage, processed.usage);

    const records = this.buildRecords(selected, commentMap, processed.externalMap, processed.analyses);
    const themeCandidates = this.buildThemeCandidates(records);
    this.logger.log(
      themeCandidates.length
        ? `Validated theme candidates: ${themeCandidates
            .map((candidate) => `${candidate.topicKey}: ${candidate.storyIds.join('+')} [${candidate.issueKeys.join(', ')}]`)
            .join('; ')}`
        : 'Validated theme candidates: none',
    );
    const synthesized = await this.synthesizeReport(records, profile, themeCandidates);
    this.addUsage(usage, synthesized.usage);
    const report = this.filterReport(synthesized.data, records, themeCandidates);
    const externalPagesRequested = records.filter(
      (item) => item.triage.followExternalLink && item.story.url,
    ).length;
    const externalPagesUsable = records.filter((item) => item.external.status === 'success').length;
    const externalPagesUnusable = records.filter((item) => item.external.status === 'unusable').length;
    const externalPagesRetrieved = externalPagesUsable + externalPagesUnusable;
    const externalPagesFailed = records.filter(
      (item) => item.external.status === 'failed' || item.external.status === 'empty',
    ).length;
    const sourceEnrichmentWarning = this.buildSourceEnrichmentWarning(records, externalPagesRequested);
    const sourceContributions = this.buildSourceContributionCounts(config.sources, candidates, records);
    const stats = {
      candidateStories: candidates.length,
      selectedStories: records.length,
      sourceContributions,
      commentsAnalyzed: records.reduce((total, item) => total + item.comments.length, 0),
      externalPagesRequested,
      // Keep the legacy field for saved-run/API compatibility. It now means retrieval succeeded,
      // while externalPagesUsable is the count that actually contributed source evidence.
      externalPagesScraped: externalPagesRetrieved,
      externalPagesRetrieved,
      externalPagesUsable,
      externalPagesUnusable,
      externalPagesFailed,
      ...(sourceEnrichmentWarning ? { sourceEnrichmentWarning } : {}),
      llmCalls: usage.calls,
      llmInputTokens: usage.inputTokens,
      llmOutputTokens: usage.outputTokens,
      llmTotalTokens: usage.inputTokens + usage.outputTokens,
    };

    if (sourceEnrichmentWarning) {
      this.logger.warn(
        `Web Scraping API source enrichment unavailable: all ${sourceEnrichmentWarning.requestedPages} requested page${sourceEnrichmentWarning.requestedPages === 1 ? '' : 's'} failed authentication.`,
      );
    }

    this.logger.log(
      `Source contribution: ${config.sources
        .map((source) => {
          const counts = sourceContributions[source] ?? { candidateStories: 0, investigatedStories: 0 };
          return `${source} ${counts.candidateStories}->${counts.investigatedStories}`;
        })
        .join(', ')}`,
    );

    this.logger.log(
      `Research LLM usage: ${usage.calls} call(s), ${usage.inputTokens} input tokens, ${usage.outputTokens} output tokens`,
    );

    context.onProgress?.('saving');
    const prompt = this.label(config);
    const saved = await this.queries.create({
      prompt,
      plan: config,
      stories: records,
      report,
      stats,
      monitorId: context.monitorId ?? dto.monitorId,
      monitorName: context.monitorName ?? dto.monitorName,
      runType: context.runType ?? (dto.monitorId ? 'manual-monitor' : 'manual'),
    });

    return {
      id: String(saved._id),
      generatedAt: new Date().toISOString(),
      sourceUrls: config.sources.map((source) => this.hnSourceUrl(source)),
      plan: config,
      stories: records,
      stats,
      report,
    };
  }

  private buildSourceEnrichmentWarning(
    records: ResearchStoryRecord[],
    externalPagesRequested: number,
  ): { code: 'decodo-authentication-failed'; requestedPages: number } | undefined {
    if (!externalPagesRequested) return undefined;

    const attempted = records.filter((item) => item.triage.followExternalLink && item.story.url);
    if (attempted.length !== externalPagesRequested) return undefined;
    if (!attempted.every((item) => item.external.status === 'failed')) return undefined;
    if (!attempted.every((item) => this.isDecodoAuthenticationError(item.external.error))) return undefined;

    return {
      code: 'decodo-authentication-failed',
      requestedPages: externalPagesRequested,
    };
  }

  private isDecodoAuthenticationError(message?: string): boolean {
    if (!message) return false;
    return /(DECODO_AUTH_TOKEN must be configured|Web Scraping API returned\s+(401|403)\b|incorrect username or password|unauthori[sz]ed|forbidden|invalid[^\n]*(credential|token)|authentication[^\n]*(failed|error))/i.test(
      message,
    );
  }

  private async triageStories(
    config: HnResearchConfig,
    profile: DepthProfile,
    stories: HnStory[],
  ): Promise<{ data: TriageDecision[]; usage: UsageTotals }> {
    const candidates = stories.map((story) => ({
      id: story.id,
      title: story.title,
      domain: story.url ? this.domain(story.url) : null,
      hasExternalUrl: Boolean(story.url),
      sources: story.sources,
      sourceRanks: story.sourceRanks,
      score: story.score,
      commentsCount: story.descendants,
      ageHours: Math.max(0, Math.round(((Date.now() / 1000 - story.time) / 3600) * 10) / 10),
      submissionText: this.truncate(story.text, 400),
    }));

    const prompt = `You are the low-cost triage stage of a Hacker News developer-intelligence research tool.

Decide which current stories deserve deeper research. Do not reproduce the popularity ranking. Favor leads likely to reveal meaningful developer interests: emerging technologies, new tools, technical techniques, architecture shifts, developer problems, recurring frustrations, or broader content opportunities.

Rules:
- Use only supplied Hacker News metadata and submission text. You have NOT read the comments or linked pages yet.
- Score and comment counts are useful signals, but novelty and technical research value can outweigh popularity.
- Ask HN can be valuable without an external URL. External-page retrieval is decided deterministically by the research pipeline after selection; do not make or return a follow-link decision.
- Select at most ${profile.selectedItemLimit} stories total.
- It is fine to select fewer stories when evidence is weak.
${config.depth === 'quick' ? '- QUICK MODE: do not select an HN-native story that has no external URL and commentsCount=0. With neither a linked source nor any discussion, it should not consume one of the limited Quick investigation slots.' : ''}
- likelyTopics: max 4 short phrases.
- topicKey: assign ONE canonical lowercase kebab-case subject-family key to every selected story. Because you can see all candidates at once, use the exact same topicKey only for stories that are genuinely about the same concrete subject family, even when they approach it from different angles. The shared key must describe WHAT the stories are about, not merely a goal, property, problem, audience, or broad work context they happen to share. Example: a Jev implementation and a Jev benchmark should both use 'typed-decision-models'. Counterexample: a deterministic Rete rule engine that uses RAG to explain verdicts is not a 'typed-decision-models' story merely because both systems make machine-readable decisions; use a subject key such as 'rule-engine-rag' instead. Human/work topics require the same discipline: a story about how companies interview developers with AI should use something like 'ai-era-hiring', while a story about whether an individual developer should keep manual coding skills sharp should use something like 'developer-skill-maintenance'. Do NOT merge them merely because both discuss AI, coding, skills, careers, or changing developer roles. Good keys include 'typed-decision-models', 'enterprise-auth', 'intel-npu-programming', 'developer-sandboxing', 'legacy-runtime', 'wordpress-security', 'ai-era-hiring', 'developer-skill-maintenance'. Avoid generic keys such as 'ai', 'security', 'python', 'tooling', 'software', or 'developer-tools'.
- reason: max 1 concise sentence.
- Return only supplied story IDs.

Return complete JSON only:
{"selected":[{"storyId":123,"priority":"high|medium|low","investigate":true,"likelyTopics":["topic"],"topicKey":"typed-decision-models","reason":"short evidence-based reason"}]}

Research depth: ${config.depth}
Sources: ${config.sources.join(', ')}
Candidates:
${JSON.stringify(candidates)}`;

    const result = await this.completeStructured<z.infer<typeof triageResponseSchema>>(
      prompt,
      triageResponseSchema,
      'triage',
      profile.triageOutputTokens,
      'HN triage',
    );
    const storyById = new Map(stories.map((story) => [story.id, story]));
    const filtered: TriageDecision[] = result.data.selected
      .filter((decision) => storyById.has(decision.storyId) && decision.investigate)
      .map((decision) => ({
        ...decision,
        // External enrichment is a pipeline rule, not an LLM judgment. Selection may still
        // enforce the depth profile's external-page budget below.
        followExternalLink: Boolean(storyById.get(decision.storyId)?.url),
      }));
    const deduplicated = this.deduplicateTriageDecisions(filtered);

    if (deduplicated.length !== filtered.length) {
      this.logger.warn(
        `Removed ${filtered.length - deduplicated.length} duplicate triage selection(s) by HN story ID`,
      );
    }

    return {
      data: deduplicated,
      usage: result.usage,
    };
  }

  private deduplicateTriageDecisions(decisions: TriageDecision[]): TriageDecision[] {
    const priorityRank = { high: 3, medium: 2, low: 1 } as const;
    const byStoryId = new Map<number, TriageDecision>();

    for (const decision of decisions) {
      const existing = byStoryId.get(decision.storyId);
      if (!existing) {
        byStoryId.set(decision.storyId, decision);
        continue;
      }

      const preferred =
        priorityRank[decision.priority] > priorityRank[existing.priority] ? decision : existing;
      const alternate = preferred === decision ? existing : decision;

      byStoryId.set(decision.storyId, {
        ...preferred,
        investigate: preferred.investigate || alternate.investigate,
        followExternalLink: preferred.followExternalLink || alternate.followExternalLink,
        likelyTopics: [...new Set([...preferred.likelyTopics, ...alternate.likelyTopics])].slice(0, 4),
      });
    }

    return [...byStoryId.values()];
  }

  private selectStories(
    candidates: HnStory[],
    decisions: TriageDecision[],
    profile: DepthProfile,
  ): Array<{ story: HnStory; decision: TriageDecision }> {
    const candidateMap = new Map(candidates.map((story) => [story.id, story]));
    const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
    const ranked = decisions
      .filter((decision) => candidateMap.has(decision.storyId))
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    let externalCount = 0;
    const selected: Array<{ story: HnStory; decision: TriageDecision }> = [];
    const selectedStoryIds = new Set<number>();

    for (const original of ranked) {
      if (selected.length >= profile.selectedItemLimit) break;
      if (selectedStoryIds.has(original.storyId)) continue;

      const story = candidateMap.get(original.storyId);
      if (!story) continue;

      if (profile.excludeZeroCommentHnOnly && !story.url && (story.descendants ?? 0) === 0) {
        this.logger.log(
          `Quick selection guard skipped HN ${story.id}: no external URL and no comments`,
        );
        continue;
      }

      const canFollow = Boolean(story.url) && externalCount < profile.externalPageLimit;
      if (canFollow) externalCount += 1;
      selectedStoryIds.add(story.id);
      selected.push({ story, decision: { ...original, followExternalLink: canFollow } });
    }
    return selected;
  }

  private async scrapeAndAnalyzeStories(
    selected: Array<{ story: HnStory; decision: TriageDecision }>,
    commentMap: Map<number, HnComment[]>,
    profile: DepthProfile,
    onAnalysisStart?: () => void,
  ): Promise<{
    externalMap: Map<number, ExternalPageResult>;
    analyses: Array<StoryAnalysis & { storyId: number }>;
    usage: UsageTotals;
  }> {
    const externalMap = new Map<number, ExternalPageResult>();
    const analyses = new Array<StoryAnalysis & { storyId: number }>(selected.length);
    const usage: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0 };
    const limitScrape = createConcurrencyLimiter(4);
    const limitAnalysis = createConcurrencyLimiter(profile.storyAnalysisConcurrency);
    let analysisStarted = false;

    this.logger.log(
      `Pipelining external scraping (max 4) with story analysis (max ${profile.storyAnalysisConcurrency})`,
    );

    await Promise.all(
      selected.map(async (item, index) => {
        const storyExternalMap = await limitScrape(() =>
          this.scrapeSelectedPages([item], profile),
        );
        const external =
          storyExternalMap.get(item.story.id) ??
          this.defaultExternalStatus(item.story, item.decision);
        externalMap.set(item.story.id, external);

        if (!analysisStarted) {
          analysisStarted = true;
          onAnalysisStart?.();
        }

        const storyAnalysis = await limitAnalysis(() =>
          this.analyzeStories(
            [item],
            commentMap,
            new Map([[item.story.id, external]]),
            profile,
          ),
        );
        this.addUsage(usage, storyAnalysis.usage);
        analyses[index] = storyAnalysis.analyses[0];
      }),
    );

    return { externalMap, analyses, usage };
  }

  private async scrapeSelectedPages(
    selected: Array<{ story: HnStory; decision: TriageDecision }>,
    profile: DepthProfile,
  ): Promise<Map<number, ExternalPageResult>> {
    const results = new Map<number, ExternalPageResult>();
    await mapWithConcurrency(selected, 4, async ({ story, decision }) => {
      if (!story.url) {
        results.set(story.id, { status: 'no-external-url' });
        return;
      }
      if (!decision.followExternalLink) {
        results.set(story.id, { status: 'not-requested' });
        return;
      }

      try {
        const markdown = await this.decodo.scrapeMarkdown(story.url);
        const trimmed = markdown.trim();
        if (!trimmed) {
          results.set(story.id, { status: 'empty' });
          return;
        }

        const validation = this.validateExternalMarkdown(story, trimmed);
        const compacted = this.compactMarkdown(trimmed, profile.markdownCharLimit);
        if (validation.verdict === 'unusable') {
          this.logger.warn(
            `External content unusable for HN ${story.id}: ${validation.reason ?? 'no usable source content detected'}`,
          );
          results.set(story.id, {
            status: 'unusable',
            markdown: compacted,
            usabilityReason: validation.reason,
          });
          return;
        }

        if (validation.verdict === 'suspicious') {
          this.logger.warn(
            `External content suspicious for HN ${story.id}; deferring usability decision to story analysis: ${validation.reason ?? 'ambiguous retrieval'}`,
          );
          results.set(story.id, {
            status: 'success',
            markdown: compacted,
            prevalidationWarning: validation.reason,
          });
          return;
        }

        results.set(story.id, { status: 'success', markdown: compacted });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`External scrape failed for HN ${story.id}: ${message}`);
        results.set(story.id, { status: 'failed', error: message.slice(0, 500) });
      }
    });
    return results;
  }

  private async analyzeStories(
    selected: Array<{ story: HnStory; decision: TriageDecision }>,
    commentMap: Map<number, HnComment[]>,
    externalMap: Map<number, ExternalPageResult>,
    profile: DepthProfile,
  ): Promise<{ analyses: Array<StoryAnalysis & { storyId: number }>; usage: UsageTotals }> {
    const usage: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0 };

    const analyses = await mapWithConcurrency(
      selected,
      profile.storyAnalysisConcurrency,
      async ({ story, decision }) => {
        const comments = commentMap.get(story.id) ?? [];
        const external = externalMap.get(story.id) ?? this.defaultExternalStatus(story, decision);
        this.logger.log(`Analyzing HN ${story.id}: ${story.title}`);

        const evidence = {
          storyId: story.id,
          title: story.title,
          hnUrl: story.hnUrl,
          externalUrl: story.url ?? null,
          sources: story.sources,
          score: story.score,
          commentsCount: story.descendants,
          submissionText: this.truncate(story.text, 1_000) ?? null,
          triage: {
            priority: decision.priority,
            likelyTopics: decision.likelyTopics.slice(0, 4),
            topicKey: decision.topicKey,
            reason: decision.reason,
          },
          comments: comments.map((comment) => ({
            id: comment.id,
            by: comment.by ?? null,
            depth: comment.depth,
            text: this.truncate(comment.text, 900),
          })),
          externalPage: {
            status: external.status,
            usabilityReason: external.usabilityReason ?? null,
            prevalidationWarning: external.prevalidationWarning ?? null,
            markdown: external.status === 'success' ? external.markdown ?? null : null,
          },
        };

        const prompt = `Analyze ONE Hacker News research lead. Keep this story isolated from every other story in the run.

The evidence can contain three layers:
1. Hacker News metadata/submission: what was shared and its current engagement.
2. External page, only when externalPage.status is "success": what the linked source actually says.
3. Hacker News comments: what developers focus on, question, dispute, recommend, or struggle with.

Rules:
- Use only the supplied evidence. Do not add outside facts or knowledge from other stories.
- Temporal consistency: do not introduce a calendar year unless that exact year appears in the supplied evidence. In particular, do not add a year to content-opportunity titles just to make them sound current; prefer undated titles when the evidence does not establish a year.
- Keep linked-source content distinct from HN reaction.
- sourceUsability is the final semantic guard on retrieved content. When externalPage.status is "success", inspect the supplied Markdown and return "usable" only if it contains substantive page-specific source content relevant to this story. Return "unusable" for a generic application shell, login/sign-in page, bot/challenge page, JavaScript scaffold, error page, unrelated redirect, or other retrieval that does not expose the linked source's actual content. If you mark it unusable, do not use that Markdown to support any claim and explain why briefly in sourceUsabilityReason.
- externalPage.prevalidationWarning is only a warning from a conservative deterministic pre-check, not proof that the source is unusable. Some real pages include generic JavaScript/app-shell boilerplate alongside complete article content. When a warning is present, inspect the entire supplied Markdown and decide based on whether story-specific source content is actually available. Do not downgrade a page merely because it contains phrases such as "enable JavaScript" if substantive article/project content is also present.
- When externalPage.status is "unusable", sourceUsability MUST be "unusable" and sourceSummary must state that the page was retrieved but did not provide usable source content. Do not reconstruct its contents from comments.
- If externalPage.status is "not-requested", sourceUsability MUST be "not-applicable" and sourceSummary MUST be exactly "Linked page not analyzed in this run."
- If externalPage.status is "failed" or "empty", sourceUsability MUST be "not-applicable" and sourceSummary must state that the linked page could not be analyzed. Do not reconstruct its contents from comments.
- If externalPage.status is "no-external-url", sourceUsability MUST be "not-applicable" and sourceSummary must state that this is an HN-native submission with no external page.
- technologies must contain only technologies, tools, standards, languages, or libraries explicitly evidenced in this story's supplied material.
- topicKey: return ONE canonical lowercase kebab-case subject-family key. It should be broad enough to match another story about the same concrete technology/category, but narrow enough to exclude merely analogous stories. The key must identify the story's central subject, not a shared outcome such as auditability, reliability, control, making decisions, productivity, employability, or adapting to AI. Examples: 'typed-decision-models', 'enterprise-auth', 'intel-npu-programming', 'developer-sandboxing', 'legacy-runtime', 'wordpress-security', 'ai-era-hiring', 'developer-skill-maintenance'. Never use generic keys such as 'ai', 'security', 'python', 'tooling', 'software', or 'developer-tools'.
- Human/work topics need especially narrow keys. Distinguish hiring/interview design from individual skill maintenance, career strategy, team workflow, productivity, or education even when the same AI-coding context appears in all of them. Example: 'How do you interview devs in a post-AI world?' can be 'ai-era-hiring'; 'Do you offload your coding to AI, or keep your skills sharp?' should be 'developer-skill-maintenance', not 'ai-era-hiring'.
- The triage stage proposed topicKey '${decision.topicKey}'. Preserve it only when the deeper source/discussion evidence confirms that the story centrally belongs to that exact subject family. Correct it when the proposed key captures only an analogy, shared goal, or broad human/work context. Example: Jev/JevBench can use 'typed-decision-models'; a deterministic Rete rules engine with RAG narration should use something like 'rule-engine-rag', not 'typed-decision-models', even though both concern decisions.
- issueKeys: return up to 4 lowercase kebab-case issue/task angles within that topic, such as 'calibration', 'benchmarking', 'cost', 'logprob-reliability', 'custom-kernel-access', or 'sandbox-overhead'. These explain how related stories differ; they do NOT determine theme matching.
- Do not infer broad trends from this single story.
- Scope claims to the evidence. Prefer formulations such as "the source argues", "the project claims", "HN commenters in this thread reported", or "one commenter reported" when appropriate.
- Preserve commenter plurality exactly. If a factual, quantitative, or anecdotal claim is supported by only one supplied comment, say "one commenter" or attribute the commenter directly. Use "multiple commenters", "several commenters", or "HN commenters" for the same claim only when at least 2 distinct supplied comment IDs independently support it.
- Never turn one commenter's experience into a claim about developers generally. Never write "developers find", "developers are", "developers want", "X is unreliable", or similarly broad wording unless multiple supplied comments independently support the same claim.
- discussionClaims: max 3, each max 1 concise sentence. For every material claim taken from comments, list the exact supporting comment IDs. Do not include an ID unless that comment actually supports the claim.
- Treat author/project claims as claims unless the supplied evidence independently verifies them.
- primaryTopic: concise and concrete.
- subtopics: max 4.
- technologies: max 5.
- issueKeys: max 4.
- sourceSummary, discussionSummary, and whyDevelopersCare: max 2 sentences each.
- problems: max 3 concrete problems.
- questions: max 3 concrete questions raised or left open.
- contentOpportunities: max 2 and only when grounded in an observed gap, question, comparison, or confusion.

Return complete JSON only:
{
  "primaryTopic":"...",
  "sourceUsability":"usable|unusable|not-applicable",
  "sourceUsabilityReason":null,
  "subtopics":["..."],
  "technologies":["..."],
  "topicKey":"typed-decision-models",
  "issueKeys":["calibration","benchmarking"],
  "sourceSummary":"...",
  "discussionSummary":"...",
  "discussionClaims":[{"claim":"...","supportingCommentIds":[123]}],
  "whyDevelopersCare":"...",
  "problems":["..."],
  "questions":["..."],
  "contentOpportunities":[{"title":"...","rationale":"..."}]
}

Evidence:
${JSON.stringify(evidence)}`;

        const rawEvidenceText = [
          story.title,
          story.text ?? '',
          ...comments.map((comment) => comment.text),
          external.status === 'success' ? external.markdown ?? '' : '',
        ].join('\n');

        try {
          const result = await this.completeStructured<StoryAnalysis>(
            prompt,
            storyAnalysisSchema,
            'analysis',
            profile.storyAnalysisOutputTokens,
            `HN ${story.id} analysis`,
          );
          this.addUsage(usage, result.usage);
          const cleaned = this.cleanStoryAnalysis(
            { storyId: story.id, ...result.data },
            comments,
            rawEvidenceText,
            decision.topicKey,
          );

          if (external.status === 'success' && cleaned.sourceUsability === 'unusable') {
            external.status = 'unusable';
            external.usabilityReason =
              cleaned.sourceUsabilityReason ?? 'Story analysis found no usable page-specific source content.';
            cleaned.sourceSummary = `The linked page was retrieved but did not provide usable source content: ${external.usabilityReason}`;
            this.logger.warn(
              `External content downgraded to unusable for HN ${story.id}: ${external.usabilityReason}`,
            );
          }

          // Canonicalize HN-native copy in code rather than relying on the analysis model to
          // distinguish an absent URL from an intentionally unrequested external page.
          if (external.status === 'no-external-url') {
            cleaned.sourceUsability = 'not-applicable';
            cleaned.sourceUsabilityReason = null;
            cleaned.sourceSummary = 'This is an HN-native submission with no external page.';
          }

          this.logger.log(`Finished analysis for HN ${story.id}`);
          return {
            storyId: story.id,
            ...cleaned,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Analysis failed for HN ${story.id}; using fallback: ${message}`);
          return {
            storyId: story.id,
            ...this.fallbackStoryAnalysis(story, decision, comments, external),
          };
        }
      },
    );

    return { analyses, usage };
  }

  private async synthesizeReport(
    records: ResearchStoryRecord[],
    profile: DepthProfile,
    themeCandidates: ThemeCandidate[],
  ): Promise<{ data: z.infer<typeof reportSchema>; usage: UsageTotals }> {
    const evidence = records.map((record) => ({
      storyId: record.story.id,
      title: record.story.title,
      score: record.story.score,
      commentsCount: record.story.descendants,
      sources: record.story.sources,
      externalStatus: record.external.status,
      externalUsabilityReason: record.external.usabilityReason ?? null,
      evidenceBasis: record.evidenceBasis,
      primaryTopic: record.analysis.primaryTopic,
      subtopics: record.analysis.subtopics,
      technologies: record.analysis.technologies,
      topicKey: record.analysis.topicKey,
      issueKeys: record.analysis.issueKeys,
      sourceSummary: record.analysis.sourceSummary,
      discussionSummary: record.analysis.discussionSummary,
      discussionClaims: (record.analysis.discussionClaims ?? []).map((item) => ({
        claim: item.claim,
        supportingCommentIds: item.supportingCommentIds,
        supportCount: item.supportingCommentIds.length,
      })),
      whyDevelopersCare: record.analysis.whyDevelopersCare,
      problems: record.analysis.problems,
      questions: record.analysis.questions,
      contentOpportunities: record.analysis.contentOpportunities,
    }));

    const prompt = `Synthesize a concise Hacker News developer-intelligence report from these already-isolated story analyses.

This is a current cross-sectional snapshot, not historical trend tracking.

Evidence provenance rules:
- Do NOT choose an evidence-basis label yourself. The backend derives it deterministically from explicit provenance.
- Every synthesized finding must include evidenceProvenance with three arrays of supplied story IDs:
  - sourceStoryIds: stories whose successfully retrieved, usable external page DIRECTLY supports material wording in the finding.
  - discussionStoryIds: stories whose analyzed HN comments DIRECTLY support material wording in the finding.
  - submissionStoryIds: stories whose HN title/submission body directly supports material wording that is not being sourced from the external page or comments.
- Every storyId in a finding must appear in at least one of those provenance arrays. Do not list a story under a provenance type merely because that evidence type exists for the story; list it only when that layer actually supports this finding.
- A story may appear in more than one provenance array when the finding deliberately combines those layers.
- sourceStoryIds may contain only stories whose externalStatus is "success". discussionStoryIds may contain only stories with analyzed comment support.
- The backend will validate these arrays against the underlying records and derive Source-backed, Discussion-only, HN submission only, or Source + discussion from what survives validation.
- Example: if a JevBench finding mentions the benchmark's sealed-set penalty from the linked page AND an HN commenter's contamination concern, put that story ID in both sourceStoryIds and discussionStoryIds. Do not mark it discussion-only simply because the analytical angle originated in comments.

Critical rules for cross-story themes:
- The "trends" array represents recurring CURRENT THEMES, not growth over time.
- Themes are optional. Returning [] is normal and preferred when selected stories are distinct.
- Each deterministic theme candidate contains ONE exact canonical topicKey shared by at least two independently analyzed stories, plus the issueKeys those stories raised within that subject family.
- A trend must copy one supplied topicKey exactly and use exactly that candidate's storyIds. Do not omit supporting stories, add unrelated stories, or broaden the topicKey into a looser umbrella.
- Use issueKeys only to explain the different angles within the shared topic; issueKeys do not need to match across stories.
- Do NOT group unrelated stories under vague umbrellas such as "vendor limitations", "modernization", "complexity", "security", "developer control", "legacy", or "practitioner needs".
- If the deterministic theme-candidate list is empty, trends MUST be [].
- Never claim that something is rising, growing, declining, accelerating, or becoming more popular unless the supplied evidence directly establishes that over time.

Executive-summary rules:
- If there are no deterministic theme candidates, describe the strongest stories as DISTINCT current signals. Do not pair stories, call them related, or create a common narrative.
- If theme candidates exist, you may connect stories only through an exact candidate topicKey that also survives as a trend.
- Describe validated themes neutrally as recurring themes/signals. Do not say they "dominate", are "major", "strongest", or represent broad developer consensus merely because they have more points/comments than other selected stories. Engagement is context, not prevalence.
- A story can still be important without belonging to a recurring theme.

Claim-scope and attribution rules:
- Use only supplied story analyses.
- Temporal consistency: do not introduce a calendar year unless that exact year appears in the supplied evidence for the finding. Do not stamp content-opportunity titles with an assumed current or previous year; prefer an undated title when the evidence does not establish a year.
- Do not generalize from one story or commenter to developers as a whole.
- For a single-story signal, explicitly scope wording with phrases such as "this story", "the linked source", "HN commenters in this thread", or "one commenter reported" where appropriate.
- Preserve discussion support counts from discussionClaims. supportCount=1 means "one commenter", never "commenters". Use "multiple/several commenters" only when supportCount >= 2 for the same claim.
- Preserve attribution for quantitative or anecdotal claims from comments. Do not turn "one commenter reported X" into "HN commenters reported X" or an unqualified fact.
- Treat project/author claims as claims unless corroborated in the supplied discussion.
- Do not turn a discussion-only or hn-submission-only observation into a factual statement about the linked source.
- Preserve scope exactly. Version/branch coverage is not installation prevalence; conditional exploitability is not universal exploitability; examples of affected projects/themes are not evidence that most projects/themes are affected.
- Strong quantifiers such as "most", "vast majority", "nearly all", "all installations", or "every site" may be used only when that exact scope is directly established by the supplied analysis. Otherwise use narrower wording such as "affected" or attribute the observation.
- Prefer precise attribution over stronger-sounding prose.

Output limits:
- executiveSummary: max 3 concise sentences. It may describe unrelated strong signals rather than forcing one narrative. Do not count or enumerate the number of signals/stories (for example, never write "four distinct signals").
- trends: max 3, one sentence each.
- technologies: max 6, one sentence each.
- developerProblems: max 5, one sentence each.
- contentOpportunities: max 5, one sentence each. Prefer explicit HN questions, disagreements, missing comparisons, or documentation gaps.
- Do not repeat a story-level summary in multiple sections unless it serves a distinct analytical purpose.
- storyIds must come from the supplied evidence.

Return complete JSON only:
{
  "executiveSummary":"...",
  "trends":[{"title":"...","description":"...","topicKey":"typed-decision-models","storyIds":[123,456],"evidenceProvenance":{"sourceStoryIds":[123],"discussionStoryIds":[123,456],"submissionStoryIds":[]}}],
  "technologies":[{"name":"...","signal":"...","storyIds":[123],"evidenceProvenance":{"sourceStoryIds":[123],"discussionStoryIds":[],"submissionStoryIds":[]}}],
  "developerProblems":[{"problem":"...","detail":"...","storyIds":[123],"evidenceProvenance":{"sourceStoryIds":[123],"discussionStoryIds":[123],"submissionStoryIds":[]}}],
  "contentOpportunities":[{"title":"...","angle":"...","storyIds":[123],"evidenceProvenance":{"sourceStoryIds":[],"discussionStoryIds":[123],"submissionStoryIds":[]}}]
}

Deterministically validated theme candidates:
${JSON.stringify(themeCandidates)}

Story analyses:
${JSON.stringify(evidence)}`;

    return this.completeStructured<z.infer<typeof reportSchema>>(
      prompt,
      reportSchema,
      'analysis',
      profile.synthesisOutputTokens,
      'HN synthesis',
    );
  }

  private buildRecords(
    selected: Array<{ story: HnStory; decision: TriageDecision }>,
    commentMap: Map<number, HnComment[]>,
    externalMap: Map<number, ExternalPageResult>,
    analyses: Array<StoryAnalysis & { storyId: number }>,
  ): ResearchStoryRecord[] {
    const analysisMap = new Map(analyses.map((analysis) => [analysis.storyId, analysis]));

    return selected.map(({ story, decision }) => {
      const comments = commentMap.get(story.id) ?? [];
      const external = externalMap.get(story.id) ?? this.defaultExternalStatus(story, decision);
      const returned = analysisMap.get(story.id);
      const analysis = returned
        ? this.cleanStoryAnalysis(returned, comments, undefined, decision.topicKey)
        : this.fallbackStoryAnalysis(story, decision, comments, external);

      analysis.sourceUsability =
        external.status === 'success'
          ? 'usable'
          : external.status === 'unusable'
            ? 'unusable'
            : 'not-applicable';
      analysis.sourceUsabilityReason =
        external.status === 'unusable'
          ? external.usabilityReason ?? analysis.sourceUsabilityReason ?? 'No usable page-specific source content was extracted.'
          : external.status === 'success'
            ? null
            : analysis.sourceUsabilityReason ?? null;

      return {
        story,
        triage: decision,
        comments,
        evidenceBasis:
          external.status === 'success'
            ? comments.length
              ? 'source-and-discussion'
              : 'source-backed'
            : comments.length
              ? 'discussion-only'
              : 'hn-submission-only',
        external: {
          status: external.status,
          markdownChars: external.markdown?.length,
          error: external.error,
          usabilityReason: external.usabilityReason,
        },
        analysis,
      };
    });
  }

  private cleanStoryAnalysis(
    analysis: StoryAnalysis & { storyId: number },
    comments: HnComment[] = [],
    rawEvidenceText?: string,
    fallbackTopicKey?: string,
  ): StoryAnalysis {
    const validCommentIds = new Set(comments.map((comment) => comment.id));
    const guard = (value: string) =>
      rawEvidenceText
        ? this.guardUnsupportedYears(
            this.guardUnsupportedQuantifiers(value, rawEvidenceText),
            rawEvidenceText,
          )
        : value;

    return {
      primaryTopic: guard(analysis.primaryTopic),
      sourceUsability: analysis.sourceUsability ?? 'not-applicable',
      sourceUsabilityReason: analysis.sourceUsabilityReason ? guard(analysis.sourceUsabilityReason) : null,
      subtopics: analysis.subtopics.slice(0, 4).map(guard),
      technologies: analysis.technologies.slice(0, 5).map(guard),
      topicKey:
        this.normalizeTopicKey(analysis.topicKey) ??
        this.normalizeTopicKey(fallbackTopicKey ?? '') ??
        '',
      issueKeys: [...new Set((analysis.issueKeys ?? []).map((key) => this.normalizeIssueKey(key)).filter((key): key is string => Boolean(key)))].slice(0, 4),
      sourceSummary: guard(analysis.sourceSummary),
      discussionSummary: guard(analysis.discussionSummary),
      discussionClaims: (analysis.discussionClaims ?? [])
        .map((item) => ({
          claim: guard(item.claim),
          supportingCommentIds: [
            ...new Set(item.supportingCommentIds.filter((id) => validCommentIds.has(id))),
          ],
        }))
        .filter((item) => item.supportingCommentIds.length > 0)
        .slice(0, 3),
      whyDevelopersCare: guard(analysis.whyDevelopersCare),
      problems: analysis.problems.slice(0, 3).map(guard),
      questions: analysis.questions.slice(0, 3).map(guard),
      contentOpportunities: analysis.contentOpportunities.slice(0, 2).map((item) => ({
        title: guard(item.title),
        rationale: guard(item.rationale),
      })),
    };
  }

  private fallbackStoryAnalysis(
    story: HnStory,
    decision: TriageDecision,
    comments: HnComment[],
    external: ExternalPageResult,
  ): StoryAnalysis {
    return {
      primaryTopic: decision.likelyTopics[0] ?? story.title,
      sourceUsability:
        external.status === 'success'
          ? 'usable'
          : external.status === 'unusable'
            ? 'unusable'
            : 'not-applicable',
      sourceUsabilityReason: external.usabilityReason ?? null,
      subtopics: decision.likelyTopics.slice(1, 5),
      technologies: [],
      topicKey: this.normalizeTopicKey(decision.topicKey) ?? '',
      issueKeys: [],
      sourceSummary:
        external.status === 'success'
          ? 'The linked page was retrieved, but its individual analysis failed.'
          : external.status === 'unusable'
            ? `The linked page was retrieved but did not provide usable source content${external.usabilityReason ? `: ${external.usabilityReason}` : '.'}`
            : external.status === 'not-requested'
              ? 'Linked page not analyzed in this run.'
              : external.status === 'no-external-url'
                ? 'This is an HN-native submission with no external page.'
                : external.status === 'empty'
                  ? 'The linked page was retrieved but contained no usable content for analysis.'
                  : 'The linked page could not be analyzed in this run.',
      discussionSummary: comments.length
        ? 'Hacker News comments were retrieved, but the individual story analysis failed.'
        : 'No Hacker News comments were included for this story.',
      discussionClaims: [],
      whyDevelopersCare: decision.reason,
      problems: [],
      questions: [],
      contentOpportunities: [],
    };
  }

  private buildThemeCandidates(records: ResearchStoryRecord[]): ThemeCandidate[] {
    const recordsByTopicKey = new Map<string, Map<number, ResearchStoryRecord>>();

    for (const record of records) {
      const topicKey = this.normalizeTopicKey(record.analysis.topicKey);
      if (!topicKey) continue;

      const grouped = recordsByTopicKey.get(topicKey) ?? new Map<number, ResearchStoryRecord>();
      grouped.set(record.story.id, record);
      recordsByTopicKey.set(topicKey, grouped);
    }

    const candidates: ThemeCandidate[] = [];

    for (const [topicKey, groupedByStoryId] of recordsByTopicKey.entries()) {
      if (groupedByStoryId.size < 2) continue;

      const grouped = [...groupedByStoryId.values()];
      const components = this.connectedTopicComponents(grouped, topicKey);
      const acceptedStoryIds = new Set<number>();

      for (const component of components.filter((items) => items.length >= 2)) {
        component.forEach((record) => acceptedStoryIds.add(record.story.id));
        candidates.push({
          topicKey,
          storyIds: component.map((record) => record.story.id).sort((a, b) => a - b),
          issueKeys: [
            ...new Set(
              component.flatMap((record) =>
                (record.analysis.issueKeys ?? [])
                  .map((key) => this.normalizeIssueKey(key))
                  .filter((key): key is string => Boolean(key)),
              ),
            ),
          ].slice(0, 12),
          storyIssues: component.map((record) => ({
            storyId: record.story.id,
            issueKeys: [
              ...new Set(
                (record.analysis.issueKeys ?? [])
                  .map((key) => this.normalizeIssueKey(key))
                  .filter((key): key is string => Boolean(key)),
              ),
            ].slice(0, 4),
          })),
        });
      }

      if (acceptedStoryIds.size < grouped.length) {
        const excluded = grouped
          .filter((record) => !acceptedStoryIds.has(record.story.id))
          .map((record) => record.story.id);
        if (excluded.length) {
          this.logger.log(
            `Rejected topicKey co-membership for ${topicKey}: ${excluded.join('+')} lacked concrete story-to-story support`,
          );
        }
      }
    }

    return candidates
      .sort((a, b) => b.storyIds.length - a.storyIds.length || a.topicKey.localeCompare(b.topicKey))
      .slice(0, 12);
  }

  private connectedTopicComponents(records: ResearchStoryRecord[], topicKey: string): ResearchStoryRecord[][] {
    const unvisited = new Set(records.map((record) => record.story.id));
    const recordById = new Map(records.map((record) => [record.story.id, record]));
    const components: ResearchStoryRecord[][] = [];

    while (unvisited.size) {
      const firstId = unvisited.values().next().value as number;
      const queue = [firstId];
      const component: ResearchStoryRecord[] = [];
      unvisited.delete(firstId);

      while (queue.length) {
        const currentId = queue.shift();
        if (currentId === undefined) continue;
        const current = recordById.get(currentId);
        if (!current) continue;
        component.push(current);

        for (const otherId of [...unvisited]) {
          const other = recordById.get(otherId);
          if (!other || !this.topicAssignmentsHaveConcreteOverlap(current, other, topicKey)) continue;
          unvisited.delete(otherId);
          queue.push(otherId);
        }
      }

      components.push(component);
    }

    return components;
  }

  private topicAssignmentsHaveConcreteOverlap(
    left: ResearchStoryRecord,
    right: ResearchStoryRecord,
    topicKey: string,
  ): boolean {
    const leftAnchors = this.themeAnchorTokens(left);
    const rightAnchors = this.themeAnchorTokens(right);
    const sharedAnchors = [...leftAnchors].filter((token) => rightAnchors.has(token));
    if (sharedAnchors.length > 0) return true;

    // Human/work themes are especially prone to false positives because broad terms such as
    // skills, careers, coding, productivity, and AI can connect otherwise different questions.
    // For these topic families, require a concrete shared subject anchor instead of rescuing
    // co-membership through generic issue overlap.
    if (this.isHumanWorkTopicKey(topicKey)) return false;

    const leftIssues = new Set(
      (left.analysis.issueKeys ?? [])
        .map((key) => this.normalizeIssueKey(key))
        .filter((key): key is string => Boolean(key)),
    );
    const rightIssues = new Set(
      (right.analysis.issueKeys ?? [])
        .map((key) => this.normalizeIssueKey(key))
        .filter((key): key is string => Boolean(key)),
    );
    const sharedIssues = [...leftIssues].filter((key) => rightIssues.has(key));

    // Two independently produced matching issue angles can validate a shared subject family
    // even when the stories use different product/vendor names (for example competing model releases).
    return sharedIssues.length >= 2;
  }

  private themeAnchorTokens(record: ResearchStoryRecord): Set<string> {
    const text = [
      record.story.title,
      record.analysis.primaryTopic,
      ...record.analysis.technologies,
    ]
      .join(' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase();

    return new Set(
      text
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token) => !THEME_ANCHOR_STOPWORDS.has(token))
        .filter((token) => !/^\d+$/.test(token)),
    );
  }

  private isHumanWorkTopicKey(topicKey: string): boolean {
    return /(?:^|-)(?:hiring|interview|career|careers|skill|skills|workplace|workforce|job|jobs|productivity|education)(?:-|$)/.test(
      topicKey,
    );
  }

  private normalizeTopicKey(value: string): string | null {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (normalized.length < 5 || GENERIC_TOPIC_KEYS.has(normalized)) return null;
    return normalized;
  }

  private normalizeIssueKey(value: string): string | null {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    return normalized.length >= 3 ? normalized : null;
  }

  private isValidatedTheme(
    topicKey: string,
    storyIds: number[],
    candidates: ThemeCandidate[],
  ): boolean {
    const normalizedKey = this.normalizeTopicKey(topicKey);
    if (!normalizedKey) return false;
    const ids = [...new Set(storyIds)].sort((a, b) => a - b);
    if (ids.length < 2) return false;

    return candidates.some(
      (candidate) =>
        candidate.topicKey === normalizedKey &&
        candidate.storyIds.length === ids.length &&
        candidate.storyIds.every((id, index) => id === ids[index]),
    );
  }

  private buildIndependentExecutiveSummary(records: ResearchStoryRecord[]): string {
    const ranked = [...records]
      .sort((a, b) => {
        const priority = { high: 3, medium: 2, low: 1 } as const;
        const priorityDelta = priority[b.triage.priority] - priority[a.triage.priority];
        return priorityDelta || b.story.score - a.story.score;
      })
      .slice(0, 4);

    const topics = ranked
      .map((record) => record.analysis.primaryTopic.replace(/[.]+$/g, '').trim())
      .filter(Boolean);

    if (!topics.length) {
      return 'This snapshot contains distinct Hacker News signals, with no validated recurring theme across the selected stories.';
    }

    const joined =
      topics.length === 1
        ? topics[0]
        : `${topics.slice(0, -1).join('; ')}; and ${topics[topics.length - 1]}`;

    return `This snapshot contains distinct developer-relevant signals with no validated recurring theme across the selected stories. Strong individual leads include ${joined}.`;
  }

  private filterReport(
    report: z.infer<typeof reportSchema>,
    records: ResearchStoryRecord[],
    themeCandidates: ThemeCandidate[],
  ) {
    const validIds = new Set(records.map((record) => record.story.id));
    const recordById = new Map(records.map((record) => [record.story.id, record]));
    const filterIds = (ids: number[]) => [...new Set(ids.filter((id) => validIds.has(id)))];
    const evidenceForIds = (ids: number[]) =>
      ids
        .map((id) => recordById.get(id))
        .filter((record): record is ResearchStoryRecord => Boolean(record))
        .map((record) => this.reportEvidenceText(record))
        .join('\n');
    const guardFindingText = (text: string, ids: number[]) => {
      const evidence = evidenceForIds(ids);
      return this.guardUnsupportedYears(this.guardUnsupportedQuantifiers(text, evidence), evidence);
    };
    const normalizeEvidenceProvenance = (
      provenance: z.infer<typeof findingEvidenceProvenanceSchema>,
      ids: number[],
    ) => {
      const storyIds = filterIds(ids);
      const allowedIds = new Set(storyIds);
      const filterProvenanceIds = (candidateIds: number[]) =>
        filterIds(candidateIds).filter((id) => allowedIds.has(id));

      const sourceStoryIds = filterProvenanceIds(provenance.sourceStoryIds).filter(
        (id) => recordById.get(id)?.external.status === 'success',
      );
      const discussionStoryIds = filterProvenanceIds(provenance.discussionStoryIds).filter(
        (id) => (recordById.get(id)?.comments.length ?? 0) > 0,
      );
      const submissionStoryIds = filterProvenanceIds(provenance.submissionStoryIds);

      const coveredIds = new Set([
        ...sourceStoryIds,
        ...discussionStoryIds,
        ...submissionStoryIds,
      ]);
      const reconciledStoryIds = storyIds.filter((id) => coveredIds.has(id));
      const removedStoryIds = storyIds.filter((id) => !coveredIds.has(id));

      if (removedStoryIds.length) {
        this.logger.warn(
          `Removed unsupported synthesized finding story ID(s) ${removedStoryIds.join('+')}: no valid evidence provenance survived reconciliation`,
        );
      }

      const validReconciledIds = new Set(reconciledStoryIds);
      const reconciledProvenance = {
        sourceStoryIds: sourceStoryIds.filter((id) => validReconciledIds.has(id)),
        discussionStoryIds: discussionStoryIds.filter((id) => validReconciledIds.has(id)),
        submissionStoryIds: submissionStoryIds.filter((id) => validReconciledIds.has(id)),
      };

      const hasSource = reconciledProvenance.sourceStoryIds.length > 0;
      const hasDiscussion = reconciledProvenance.discussionStoryIds.length > 0;
      const evidenceBasis: z.infer<typeof evidenceBasisSchema> = hasSource
        ? hasDiscussion
          ? 'source-and-discussion'
          : 'source-backed'
        : hasDiscussion
          ? 'discussion-only'
          : 'hn-submission-only';

      return {
        storyIds: reconciledStoryIds,
        evidenceProvenance: reconciledProvenance,
        evidenceBasis,
      };
    };

    const normalizeItem = <
      T extends {
        storyIds: number[];
        evidenceProvenance: z.infer<typeof findingEvidenceProvenanceSchema>;
      },
    >(
      item: T,
    ) => {
      const reconciled = normalizeEvidenceProvenance(item.evidenceProvenance, item.storyIds);
      return {
        ...item,
        ...reconciled,
      };
    };

    const validTrends = report.trends
      .map(normalizeItem)
      .map((item) => ({
        ...item,
        topicKey: this.normalizeTopicKey(item.topicKey) ?? item.topicKey,
        title: guardFindingText(item.title, item.storyIds),
        description: guardFindingText(item.description, item.storyIds),
      }))
      .filter((item) => item.storyIds.length >= 2)
      .filter((item) => this.isValidatedTheme(item.topicKey, item.storyIds, themeCandidates))
      .slice(0, 3);

    const allEvidence = records.map((record) => this.reportEvidenceText(record)).join('\n');
    const executiveSummary =
      validTrends.length > 0
        ? this.removeSignalCounts(
            this.guardUnsupportedYears(
              this.guardUnsupportedQuantifiers(report.executiveSummary, allEvidence),
              allEvidence,
            ),
          )
        : this.buildIndependentExecutiveSummary(records);

    return {
      ...report,
      executiveSummary,
      trends: validTrends,
      technologies: report.technologies
        .map(normalizeItem)
        .filter((item) => item.storyIds.length > 0)
        .map((item) => ({
          ...item,
          name: guardFindingText(item.name, item.storyIds),
          signal: guardFindingText(item.signal, item.storyIds),
        }))
        .slice(0, 6),
      developerProblems: report.developerProblems
        .map(normalizeItem)
        .filter((item) => item.storyIds.length > 0)
        .map((item) => ({
          ...item,
          problem: guardFindingText(item.problem, item.storyIds),
          detail: guardFindingText(item.detail, item.storyIds),
        }))
        .slice(0, 5),
      contentOpportunities: report.contentOpportunities
        .map(normalizeItem)
        .filter((item) => item.storyIds.length > 0)
        .map((item) => ({
          ...item,
          title: guardFindingText(item.title, item.storyIds),
          angle: guardFindingText(item.angle, item.storyIds),
        }))
        .slice(0, 5),
    };
  }

  private reportEvidenceText(record: ResearchStoryRecord): string {
    return [
      record.story.title,
      record.analysis.primaryTopic,
      ...record.analysis.subtopics,
      ...record.analysis.technologies,
      record.analysis.sourceSummary,
      record.analysis.discussionSummary,
      ...(record.analysis.discussionClaims ?? []).map((item) => item.claim),
      record.analysis.whyDevelopersCare,
      ...record.analysis.problems,
      ...record.analysis.questions,
      ...record.analysis.contentOpportunities.flatMap((item) => [item.title, item.rationale]),
    ].join('\n');
  }

  private guardUnsupportedYears(text: string, evidenceText: string): string {
    const yearPattern = /\b(?:19|20)\d{2}\b/g;
    const supportedYears = new Set(evidenceText.match(yearPattern) ?? []);
    const generatedYears = [...new Set(text.match(yearPattern) ?? [])];
    const unsupportedYears = generatedYears.filter((year) => !supportedYears.has(year));

    if (!unsupportedYears.length) return text;

    let guarded = text;
    for (const year of unsupportedYears) {
      // Remove common editorial date-stamping phrases as a unit so titles such as
      // "A practical framework for 2025" become "A practical framework" rather
      // than the malformed "A practical framework for".
      guarded = guarded
        .replace(
          new RegExp(
            `\\s+(?:for|in|during|throughout|from|as\\s+of|since|by|through)\\s+${year}\\b`,
            'gi',
          ),
          '',
        )
        .replace(new RegExp(`\\b${year}\\s+(?=(?:edition|guide|update|report|comparison|landscape|framework)\\b)`, 'gi'), '')
        .replace(new RegExp(`\\b${year}\\b`, 'g'), '');
    }

    return guarded
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private guardUnsupportedQuantifiers(text: string, evidenceText: string): string {
    const evidence = evidenceText.toLowerCase().replace(/\s+/g, ' ');
    let guarded = text;

    const phraseRules: Array<{ phrase: RegExp; literal: string; replacement: string }> = [
      { phrase: /\bvast majority of\s+/gi, literal: 'vast majority', replacement: 'affected ' },
      { phrase: /\boverwhelming majority of\s+/gi, literal: 'overwhelming majority', replacement: 'affected ' },
      { phrase: /\blarge majority of\s+/gi, literal: 'large majority', replacement: 'affected ' },
      { phrase: /\bvast number of\s+/gi, literal: 'vast number', replacement: 'affected ' },
      { phrase: /\balmost all\s+/gi, literal: 'almost all', replacement: 'affected ' },
      { phrase: /\bnearly all\s+/gi, literal: 'nearly all', replacement: 'affected ' },
      { phrase: /\bvirtually all\s+/gi, literal: 'virtually all', replacement: 'affected ' },
      { phrase: /\bmajority of\s+/gi, literal: 'majority of', replacement: 'some ' },
    ];

    for (const rule of phraseRules) {
      if (!evidence.includes(rule.literal)) guarded = guarded.replace(rule.phrase, rule.replacement);
    }

    guarded = guarded.replace(
      /\b(all|every)\s+((?:[a-z0-9-]+\s+){0,2})(installations?|sites?|users?|developers?|projects?|organizations?|companies?)\b/gi,
      (match, _quantifier: string, modifiers: string, noun: string) =>
        evidence.includes(match.toLowerCase()) ? match : `affected ${modifiers}${noun}`,
    );

    return guarded.replace(/\s{2,}/g, ' ').trim();
  }

  private removeSignalCounts(text: string): string {
    return text.replace(
      /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:distinct\s+)?(?:strong\s+)?signals?\b/gi,
      'several current signals',
    );
  }

  private async completeStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    purpose: 'triage' | 'analysis',
    maxOutputTokens: number,
    label: string,
  ): Promise<{ data: T; usage: UsageTotals }> {
    const usage: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0 };
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await this.llm.complete({
        responseFormat: 'json',
        purpose,
        maxOutputTokens: attempt === 1 ? maxOutputTokens : Math.min(Math.ceil(maxOutputTokens * 1.35), 8_000),
        messages: [
          {
            role: 'user',
            content:
              attempt === 1
                ? prompt
                : `${prompt}\n\nIMPORTANT RETRY: The previous response was invalid or incomplete JSON. Return shorter, complete JSON only. Do not add prose or markdown fences.`,
          },
        ],
      });
      this.addResponseUsage(usage, response);

      try {
        const parsed = this.llm.parseJsonResponse<unknown>(response.content);
        return { data: schema.parse(parsed), usage };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `${label} JSON attempt ${attempt} failed${response.stopReason ? ` (stop: ${response.stopReason})` : ''}: ${message}`,
        );
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} returned invalid JSON.`);
  }

  private addResponseUsage(total: UsageTotals, response: LlmResponse) {
    total.calls += 1;
    total.inputTokens += response.usage?.inputTokens ?? 0;
    total.outputTokens += response.usage?.outputTokens ?? 0;
  }

  private addUsage(total: UsageTotals, addition: UsageTotals) {
    total.calls += addition.calls;
    total.inputTokens += addition.inputTokens;
    total.outputTokens += addition.outputTokens;
  }

  private defaultExternalStatus(story: HnStory, decision: TriageDecision): ExternalPageResult {
    if (!story.url) return { status: 'no-external-url' };
    return decision.followExternalLink
      ? { status: 'failed', error: 'No scrape result was recorded.' }
      : { status: 'not-requested' };
  }

  private buildSourceContributionCounts(
    sources: HnSource[],
    candidates: HnStory[],
    records: ResearchStoryRecord[],
  ): SourceContributionCounts {
    const counts = Object.fromEntries(
      sources.map((source) => [source, { candidateStories: 0, investigatedStories: 0 }]),
    ) as SourceContributionCounts;

    for (const story of candidates) {
      const source = this.primaryContributionSource(story, sources);
      if (source && counts[source]) counts[source]!.candidateStories += 1;
    }

    for (const record of records) {
      const source = this.primaryContributionSource(record.story, sources);
      if (source && counts[source]) counts[source]!.investigatedStories += 1;
    }

    return counts;
  }

  private primaryContributionSource(story: HnStory, sourceOrder: HnSource[]): HnSource | undefined {
    const eligible = sourceOrder.filter((source) => story.sources.includes(source));
    if (!eligible.length) return undefined;

    return eligible.sort((left, right) => {
      const leftRank = story.sourceRanks[left] ?? Number.MAX_SAFE_INTEGER;
      const rightRank = story.sourceRanks[right] ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return sourceOrder.indexOf(left) - sourceOrder.indexOf(right);
    })[0];
  }

  private label(config: HnResearchConfig): string {
    const sources = config.sources.map((source) => source.toUpperCase()).join(', ');
    return `HN ${config.depth} research · ${sources}`;
  }

  private hnSourceUrl(source: HnSource): string {
    if (source === 'new') return 'https://news.ycombinator.com/newest';
    if (source === 'ask') return 'https://news.ycombinator.com/ask';
    if (source === 'show') return 'https://news.ycombinator.com/show';
    return 'https://news.ycombinator.com/';
  }

  private domain(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  private validateExternalMarkdown(
    story: HnStory,
    markdown: string,
  ): ExternalMarkdownValidation {
    const normalized = markdown.toLowerCase().replace(/\s+/g, ' ').trim();
    const plainText = markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#>*_~|=-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = plainText.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? [];

    if (plainText.length < 280 || words.length < 45) {
      return {
        verdict: 'unusable',
        reason: 'The retrieved page contained too little substantive text to use as source evidence.',
      };
    }

    // Hard-reject only unmistakable access/challenge responses. Generic JavaScript/app-shell
    // phrases are handled below as suspicious because real pages can contain that boilerplate
    // alongside complete article content.
    const hardChallenges: Array<{ pattern: RegExp; reason: string }> = [
      {
        pattern: /checking (?:your )?browser before accessing/i,
        reason: 'The retrieved page was a browser-verification challenge rather than the linked content.',
      },
      {
        pattern: /enable javascript and cookies to continue/i,
        reason: 'The retrieved page was an access/challenge shell rather than the linked content.',
      },
      {
        pattern: /(?:cloudflare|security check).{0,80}verify (?:that )?you are human/i,
        reason: 'The retrieved page was a human-verification challenge rather than the linked content.',
      },
    ];

    for (const challenge of hardChallenges) {
      if (challenge.pattern.test(markdown)) return { verdict: 'unusable', reason: challenge.reason };
    }

    const hostname = this.domain(story.url ?? '') ?? '';
    const titleTokens = story.title
      .toLowerCase()
      .replace(/\b(?:show|ask|tell)\s+hn\s*:?/g, ' ')
      .match(/[a-z0-9][a-z0-9-]{3,}/g)
      ?.filter(
        (token) =>
          ![
            'about',
            'after',
            'before',
            'built',
            'from',
            'have',
            'into',
            'more',
            'that',
            'their',
            'this',
            'using',
            'what',
            'when',
            'with',
          ].includes(token),
      ) ?? [];
    const titleMatches = titleTokens.filter((token) => normalized.includes(token)).length;

    // Public Notion pages can resolve to a generic workspace shell. This remains a hard reject
    // only when no story-specific title token is present and multiple Notion UI signals appear.
    if (hostname.endsWith('notion.site') || hostname.endsWith('notion.so')) {
      const notionUiSignals = [
        'notion',
        'log in',
        'sign up',
        'workspace',
        'download notion',
        'notion calendar',
      ].filter((signal) => normalized.includes(signal)).length;
      if (titleTokens.length > 0 && titleMatches === 0 && notionUiSignals >= 2) {
        return {
          verdict: 'unusable',
          reason: 'The Notion URL resolved to a generic workspace/application shell without page-specific content.',
        };
      }
    }

    const authSignals = [/\bsign in\b/i, /\blog in\b/i].filter((pattern) => pattern.test(markdown)).length;
    const credentialSignals = [/\bpassword\b/i, /\bemail address\b/i, /\bcontinue with google\b/i].filter(
      (pattern) => pattern.test(markdown),
    ).length;
    if (authSignals > 0 && credentialSignals > 0 && words.length < 350) {
      return {
        verdict: 'unusable',
        reason: 'The retrieved page was a login/sign-in screen rather than the linked source content.',
      };
    }

    if (words.length < 220 && /\b(?:404|page not found|access denied|request blocked)\b/i.test(markdown)) {
      return {
        verdict: 'unusable',
        reason: 'The retrieved page was an error or access-denied page rather than the linked source content.',
      };
    }

    const suspiciousShells: Array<{ pattern: RegExp; reason: string }> = [
      {
        pattern: /you need to enable javascript to run this app/i,
        reason: 'The retrieved page contains JavaScript application-shell boilerplate that may or may not accompany the actual linked content.',
      },
      {
        pattern: /please enable javascript (?:in your browser )?to (?:continue|view|use)/i,
        reason: 'The retrieved page contains a JavaScript-required message that may be page chrome rather than evidence that the article is unavailable.',
      },
      {
        pattern: /verify (?:that )?you are human/i,
        reason: 'The retrieved page contains a human-verification phrase, but the response also contains enough text that semantic validation is required.',
      },
    ];

    for (const shell of suspiciousShells) {
      if (shell.pattern.test(markdown)) {
        return { verdict: 'suspicious', reason: shell.reason };
      }
    }

    return { verdict: 'usable' };
  }

  private compactMarkdown(markdown: string, maxChars: number): string {
    const cleaned = markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (cleaned.length <= maxChars) return cleaned;

    const headBudget = Math.floor(maxChars * 0.65);
    const tailBudget = Math.floor(maxChars * 0.18);
    const headingBudget = maxChars - headBudget - tailBudget - 120;
    const headings = cleaned
      .split('\n')
      .filter((line) => /^#{1,4}\s+\S/.test(line.trim()))
      .join('\n')
      .slice(0, Math.max(0, headingBudget));
    const head = cleaned.slice(0, headBudget);
    const tail = cleaned.slice(-tailBudget);

    return `${head}\n\n[Middle of page omitted to reduce LLM context.]\n\n${headings ? `Page headings:\n${headings}\n\n` : ''}[End of page]\n${tail}`.slice(0, maxChars);
  }

  private truncate(value: string | undefined, maxChars: number): string | undefined {
    if (!value) return undefined;
    if (value.length <= maxChars) return value;
    return `${value.slice(0, Math.max(0, maxChars - 14))}\n[truncated]`;
  }
}
