import { AlertTriangle, Download, ExternalLink, FileText, MessageSquareText, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exportAsJson, exportAsMarkdown } from '../utils/export';
import { getSourceEnrichmentWarning } from '../utils/source-enrichment';
import type { FindingEvidenceBasis, ResearchResult, ResearchStoryRecord } from '../tracker.types';

const sourceLabel = (source: string) => {
  if (source === 'top') return 'Front page';
  if (source === 'new') return 'New HN submissions';
  if (source === 'ask') return 'Ask HN';
  if (source === 'show') return 'Show HN';
  return source;
};

const depthLabel = (depth?: string) => (depth ? depth[0].toUpperCase() + depth.slice(1) : 'Research');

const externalStatusLabel = (story: ResearchStoryRecord) => {
  if (story.external.status === 'success') return 'Linked page usable';
  if (story.external.status === 'unusable') return 'Linked page retrieved · content unusable';
  if (story.external.status === 'failed') return 'Linked page unavailable';
  if (story.external.status === 'empty') return 'Linked page returned no content';
  if (story.external.status === 'no-external-url') return 'HN-native submission';
  return 'Linked page not analyzed';
};

const findingEvidenceLabel = (basis?: FindingEvidenceBasis) => {
  if (basis === 'source-backed') return 'Source-backed';
  if (basis === 'discussion-only') return 'Discussion-only';
  if (basis === 'hn-submission-only') return 'HN submission only';
  if (basis === 'source-and-discussion' || basis === 'mixed') return 'Source + discussion';
  return null;
};

const leadEvidenceLabel = (record: ResearchStoryRecord) => {
  const basis =
    record.evidenceBasis ??
    (record.external.status === 'success'
      ? record.comments.length
        ? 'source-and-discussion'
        : 'source-backed'
      : record.comments.length
        ? 'discussion-only'
        : 'hn-submission-only');
  if (basis === 'source-and-discussion') return 'Source + discussion';
  if (basis === 'source-backed' || basis === 'source-only') return 'Source-backed';
  if (basis === 'discussion-only') return 'Discussion-only';
  if (basis === 'hn-submission-only') return 'HN submission only';
  // Legacy saved runs used hn-only for both HN discussion and zero-comment submissions.
  if (basis === 'hn-only') return record.comments.length ? 'Discussion-only' : 'HN submission only';
  return 'Not recorded';
};

export const ReportView = ({ result }: { result: ResearchResult }) => {
  const { report, stories, plan, generatedAt, stats } = result;
  const storyById = new Map(stories.map((item) => [item.story.id, item]));
  const externalPagesRetrieved = stats.externalPagesRetrieved ?? stats.externalPagesScraped;
  const externalPagesUsable = stats.externalPagesUsable ?? stats.externalPagesScraped;
  const externalPagesUnusable = stats.externalPagesUnusable ?? 0;
  const sourceEnrichmentWarning = getSourceEnrichmentWarning(result);
  const visibleSourceContributions = plan.sources
    .map((source) => ({ source, counts: stats.sourceContributions?.[source] }))
    .filter(
      (item): item is {
        source: (typeof plan.sources)[number];
        counts: { candidateStories: number; investigatedStories: number };
      } => Boolean(item.counts),
    );

  const Evidence = ({ ids }: { ids: number[] }) => {
    const items = ids.map((id) => storyById.get(id)).filter((item): item is ResearchStoryRecord => Boolean(item));
    if (!items.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <a
            key={item.story.id}
            href={item.story.hnUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            HN {item.story.id}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ))}
      </div>
    );
  };

  const EvidenceBasis = ({ basis }: { basis?: FindingEvidenceBasis }) => {
    const label = findingEvidenceLabel(basis);
    if (!label) return null;
    return <Badge variant="outline" className="mt-2 text-[10px] font-normal">{label}</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{depthLabel(plan.depth)}</Badge>
          <span>{plan.sources.map(sourceLabel).join(' + ')}</span>
          <span>·</span>
          <span>{new Date(generatedAt).toLocaleString()}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportAsMarkdown(result)}>
            <Download className="mr-2 h-3.5 w-3.5" />Markdown
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAsJson(result)}>
            <Download className="mr-2 h-3.5 w-3.5" />JSON
          </Button>
        </div>
      </div>

      {sourceEnrichmentWarning?.code === 'decodo-authentication-failed' && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">Decodo Web Scraping API enrichment unavailable</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                All {sourceEnrichmentWarning.requestedPages} linked-page request
                {sourceEnrichmentWarning.requestedPages === 1 ? '' : 's'} failed Decodo authentication. The report still completed, but no external pages were analyzed, so findings use Hacker News submission and comment evidence only.{' '}
                <a href="/settings#decodo-credentials" className="font-medium text-foreground underline underline-offset-2">
                  Check Decodo credentials in Settings
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Research summary</div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6">{report.executiveSummary}</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-4 w-4 text-primary" />Candidate stories
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.candidateStories}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.selectedStories} selected for deeper analysis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4 text-primary" />Usable source pages
            </div>
            <p className="mt-2 text-2xl font-semibold">{externalPagesUsable}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.externalPagesRequested} requested · {externalPagesRetrieved} retrieved
              {externalPagesUnusable ? ` · ${externalPagesUnusable} unusable` : ''}
              {stats.externalPagesFailed ? ` · ${stats.externalPagesFailed} failed` : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquareText className="h-4 w-4 text-primary" />HN comments analyzed
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.commentsAnalyzed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />LLM usage
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {typeof stats.llmTotalTokens === 'number' ? stats.llmTotalTokens.toLocaleString() : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {typeof stats.llmCalls === 'number'
                ? `${stats.llmCalls} call${stats.llmCalls === 1 ? '' : 's'} · ${(stats.llmInputTokens ?? 0).toLocaleString()} in · ${(stats.llmOutputTokens ?? 0).toLocaleString()} out`
                : 'Token usage unavailable for this saved run'}
            </p>
          </CardContent>
        </Card>
      </div>

      {!!visibleSourceContributions.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Source contribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {visibleSourceContributions.map(({ source, counts }) => (
                <div key={source} className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs font-medium">{sourceLabel(source)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {counts.candidateStories} candidates · {counts.investigatedStories} investigated
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Each story is counted once. Stories present in multiple selected feeds are attributed to the feed where they rank highest.
            </p>
          </CardContent>
        </Card>
      )}

      {!!report.trends.length && (
        <div>
          <div className="mb-3">
            <h3 className="text-base font-semibold">Developer themes</h3>
            <p className="text-xs text-muted-foreground">Recurring subjects supported by multiple researched stories</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {report.trends.map((trend, index) => (
              <Card key={`${trend.title}-${index}`}>
                <CardContent className="pt-5">
                  <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--topic-bg)] text-xs font-semibold text-[var(--topic-fg)]">
                    {index + 1}
                  </div>
                  <p className="text-sm font-semibold">{trend.title}</p>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{trend.description}</p>
                  <EvidenceBasis basis={trend.evidenceBasis} />
                  <Evidence ids={trend.storyIds} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!!report.technologies.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Technologies and tools in focus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.technologies.map((item) => (
              <div key={item.name} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.signal}</p>
                <EvidenceBasis basis={item.evidenceBasis} />
                <Evidence ids={item.storyIds} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!!report.developerProblems.length && (
        <div>
          <div className="mb-3">
            <h3 className="text-base font-semibold">Developer problems and questions</h3>
            <p className="text-xs text-muted-foreground">Pain points surfaced by the submitted material and HN discussion</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {report.developerProblems.map((item) => (
              <Card key={item.problem}>
                <CardContent className="pt-5">
                  <p className="text-sm font-semibold">{item.problem}</p>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{item.detail}</p>
                  <EvidenceBasis basis={item.evidenceBasis} />
                  <Evidence ids={item.storyIds} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!!report.contentOpportunities.length && (
        <div>
          <div className="mb-3">
            <h3 className="text-base font-semibold">Content opportunities</h3>
            <p className="text-xs text-muted-foreground">Potential technical content grounded in observed questions and gaps</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {report.contentOpportunities.map((item) => (
              <Card key={item.title}>
                <CardContent className="pt-5">
                  <Sparkles className="mb-2 h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{item.angle}</p>
                  <EvidenceBasis basis={item.evidenceBasis} />
                  <Evidence ids={item.storyIds} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Research leads <span className="font-normal text-muted-foreground">({stories.length})</span></CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {stories.map((record) => (
            <div key={record.story.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={record.story.hnUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--topic-fg)] hover:underline">
                      {record.story.title}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {record.story.sources.map((source) => <Badge key={source} variant="secondary">{sourceLabel(source)}</Badge>)}
                    <Badge variant="outline" className="text-[10px] font-normal">{leadEvidenceLabel(record)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.story.score} points · {record.story.descendants} comments · {externalStatusLabel(record)}
                  </p>
                  {record.external.status === 'unusable' && record.external.usabilityReason && (
                    <p className="mt-1 text-xs text-muted-foreground">Source note: {record.external.usabilityReason}</p>
                  )}
                  <p className="mt-2 text-sm font-medium">{record.analysis.primaryTopic}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{record.analysis.whyDevelopersCare}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{record.story.url ? 'Linked source' : 'HN submission'}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{record.analysis.sourceSummary}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">HN discussion</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{record.analysis.discussionSummary}</p>
                    </div>
                  </div>
                  {!!record.analysis.technologies.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {record.analysis.technologies.slice(0, 8).map((technology) => (
                        <Badge key={technology} variant="outline">{technology}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {record.story.url && (
                    <Button asChild variant="outline" size="sm">
                      <a href={record.story.url} target="_blank" rel="noreferrer">
                        Source <ExternalLink className="ml-1.5 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
