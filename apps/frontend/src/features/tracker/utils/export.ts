import type { FindingEvidenceBasis, ResearchResult, ResearchStoryRecord } from '../tracker.types';
import { getSourceEnrichmentWarning } from './source-enrichment';

const sourceLabel = (source: string) => {
  if (source === 'top') return 'Front page';
  if (source === 'new') return 'New HN submissions';
  if (source === 'ask') return 'Ask HN';
  if (source === 'show') return 'Show HN';
  return source;
};

const findingEvidenceLabel = (basis?: FindingEvidenceBasis) => {
  if (basis === 'source-backed') return 'Source-backed';
  if (basis === 'discussion-only') return 'Discussion-only';
  if (basis === 'hn-submission-only') return 'HN submission only';
  if (basis === 'source-and-discussion' || basis === 'mixed') return 'Source + discussion';
  return 'Not recorded';
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


const externalPageLabel = (record: ResearchStoryRecord) => {
  if (record.external.status === 'success') return 'usable';
  if (record.external.status === 'unusable') return 'retrieved, content unusable';
  if (record.external.status === 'failed') return 'failed';
  if (record.external.status === 'empty') return 'retrieved, empty';
  if (record.external.status === 'no-external-url') return 'no external URL';
  return 'not analyzed';
};

const download = (contents: string, type: string, filename: string) => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const exportAsJson = (result: ResearchResult) => {
  download(JSON.stringify(result, null, 2), 'application/json', 'hacker-news-intelligence-report.json');
};

export const exportAsMarkdown = (result: ResearchResult) => {
  const { report, stories, plan, generatedAt, stats } = result;
  const externalPagesRetrieved = stats.externalPagesRetrieved ?? stats.externalPagesScraped;
  const externalPagesUsable = stats.externalPagesUsable ?? stats.externalPagesScraped;
  const externalPagesUnusable = stats.externalPagesUnusable ?? 0;
  const sourceEnrichmentWarning = getSourceEnrichmentWarning(result);
  const sourceContributionText = plan.sources
    .map((source) => {
      const counts = stats.sourceContributions?.[source];
      return counts
        ? `${sourceLabel(source)} ${counts.candidateStories} candidates / ${counts.investigatedStories} investigated`
        : null;
    })
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  const lines = [
    '# Hacker News intelligence report',
    '',
    `- **Depth:** ${plan.depth}`,
    `- **Sources:** ${plan.sources.map(sourceLabel).join(', ')}`,
    `- **Generated:** ${new Date(generatedAt).toLocaleString()}`,
    `- **Candidate stories:** ${stats.candidateStories}`,
    `- **Stories investigated:** ${stats.selectedStories}`,
    ...(sourceContributionText
      ? [
          `- **Source contribution:** ${sourceContributionText}`,
          '- **Source attribution:** overlapping stories are counted once under the selected feed where they rank highest',
        ]
      : []),
    `- **External pages retrieved:** ${externalPagesRetrieved}/${stats.externalPagesRequested}`,
    `- **Usable external sources:** ${externalPagesUsable}/${stats.externalPagesRequested}`,
    ...(externalPagesUnusable ? [`- **Unusable external sources:** ${externalPagesUnusable}`] : []),
    ...(stats.externalPagesFailed ? [`- **Failed external retrievals:** ${stats.externalPagesFailed}`] : []),
    `- **HN comments analyzed:** ${stats.commentsAnalyzed}`,
    ...(typeof stats.llmTotalTokens === 'number' ? [`- **LLM calls:** ${stats.llmCalls ?? 0}`, `- **LLM tokens:** ${stats.llmTotalTokens.toLocaleString()} (${(stats.llmInputTokens ?? 0).toLocaleString()} input + ${(stats.llmOutputTokens ?? 0).toLocaleString()} output)`] : []),
    '',
    ...(sourceEnrichmentWarning?.code === 'decodo-authentication-failed'
      ? [
          `> **Warning — Decodo Web Scraping API enrichment unavailable:** All ${sourceEnrichmentWarning.requestedPages} linked-page request${sourceEnrichmentWarning.requestedPages === 1 ? '' : 's'} failed Decodo authentication. The report still completed, but no external pages were analyzed, so findings use Hacker News submission and comment evidence only. Check Decodo credentials in Settings.`,
          '',
        ]
      : []),
    '## Summary',
    '',
    report.executiveSummary,
    '',
  ];

  if (report.trends.length) {
    lines.push('## Developer themes', '');
    for (const item of report.trends) {
      lines.push(`### ${item.title}`, '', item.description, '', `Evidence basis: ${findingEvidenceLabel(item.evidenceBasis)}`, `Evidence: ${item.storyIds.map((id) => `HN ${id}`).join(', ')}`, '');
    }
  }

  if (report.technologies.length) {
    lines.push('## Technologies and tools in focus', '');
    for (const item of report.technologies) lines.push(`- **${item.name}:** ${item.signal} _[${findingEvidenceLabel(item.evidenceBasis)}]_`);
    lines.push('');
  }

  if (report.developerProblems.length) {
    lines.push('## Developer problems and questions', '');
    for (const item of report.developerProblems) lines.push(`- **${item.problem}:** ${item.detail} _[${findingEvidenceLabel(item.evidenceBasis)}]_`);
    lines.push('');
  }

  if (report.contentOpportunities.length) {
    lines.push('## Content opportunities', '');
    for (const item of report.contentOpportunities) lines.push(`- **${item.title}:** ${item.angle} _[${findingEvidenceLabel(item.evidenceBasis)}]_`);
    lines.push('');
  }

  lines.push('## Research leads', '');
  for (const record of stories) {
    lines.push(
      `### [${record.story.title}](${record.story.hnUrl})`,
      '',
      `- **HN engagement:** ${record.story.score} points, ${record.story.descendants} comments`,
      `- **Primary topic:** ${record.analysis.primaryTopic}`,
      `- **Evidence basis:** ${leadEvidenceLabel(record)}`,
      `- **External page:** ${externalPageLabel(record)}${record.external.usabilityReason ? ` — ${record.external.usabilityReason}` : ''}`,
      record.story.url ? `- **Source:** ${record.story.url}` : '- **Source:** Hacker News submission',
      '',
      record.analysis.whyDevelopersCare,
      '',
      `**${record.story.url ? 'Linked source' : 'HN submission'}:** ${record.analysis.sourceSummary}`,
      '',
      `**HN discussion:** ${record.analysis.discussionSummary}`,
      '',
    );
  }

  download(lines.join('\n'), 'text/markdown', 'hacker-news-intelligence-report.md');
};
