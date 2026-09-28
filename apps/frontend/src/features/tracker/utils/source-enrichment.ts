import type { ResearchResult, SourceEnrichmentWarning } from '../tracker.types';

const isDecodoAuthenticationError = (message?: string) => {
  if (!message) return false;
  return /(DECODO_AUTH_TOKEN must be configured|Web Scraping API returned\s+(401|403)\b|incorrect username or password|unauthori[sz]ed|forbidden|invalid[^\n]*(credential|token)|authentication[^\n]*(failed|error))/i.test(
    message,
  );
};

export const getSourceEnrichmentWarning = (result: ResearchResult): SourceEnrichmentWarning | undefined => {
  if (result.stats.sourceEnrichmentWarning) return result.stats.sourceEnrichmentWarning;
  if (!result.stats.externalPagesRequested) return undefined;

  // Backward-compatible fallback for saved runs created before the run-level warning was persisted.
  const attempted = result.stories.filter(
    (record) =>
      Boolean(record.story.url) &&
      record.external.status !== 'not-requested' &&
      record.external.status !== 'no-external-url',
  );

  if (attempted.length !== result.stats.externalPagesRequested) return undefined;
  if (!attempted.every((record) => record.external.status === 'failed')) return undefined;
  if (!attempted.every((record) => isDecodoAuthenticationError(record.external.error))) return undefined;

  return {
    code: 'decodo-authentication-failed',
    requestedPages: result.stats.externalPagesRequested,
  };
};
