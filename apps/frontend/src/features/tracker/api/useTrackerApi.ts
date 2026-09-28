import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ResearchConfig, ResearchResult } from '../tracker.types';

export type ResearchProgressStage =
  | 'collecting'
  | 'discussing'
  | 'triaging'
  | 'scraping'
  | 'analyzing'
  | 'saving';

async function streamResearch(
  input: ResearchConfig,
  onProgress?: (stage: ResearchProgressStage) => void,
): Promise<ResearchResult> {
  const base = (api.defaults.baseURL || '/api').replace(/\/$/, '');
  const response = await fetch(`${base}/research/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const proxyUnavailable =
      [502, 503, 504].includes(response.status) &&
      (base === '/api' || /ECONNREFUSED|proxying request|upstream/i.test(responseText));

    if (proxyUnavailable) {
      throw new Error(
        'Research backend is unavailable. The frontend could not reach the local API on port 5002. Make sure MongoDB is running (`bun run db:up`) and start the full app with `bun dev`, then retry.',
      );
    }

    throw new Error(`Research request failed (${response.status}).`);
  }

  if (!response.body) throw new Error('Research request returned no response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ResearchResult | undefined;

  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as {
      type: string;
      stage?: ResearchProgressStage;
      result?: ResearchResult;
      message?: string;
    };
    if (event.type === 'progress' && event.stage) onProgress?.(event.stage);
    if (event.type === 'result' && event.result) result = event.result;
    if (event.type === 'error') throw new Error(event.message || 'Research failed');
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) consume(line);
    if (done) break;
  }
  consume(buffer);
  if (!result) throw new Error('Research completed without a report.');
  return result;
}

export const useResearchMutation = (onProgress?: (stage: ResearchProgressStage) => void) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ResearchConfig) => streamResearch(input, onProgress),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['queries'] }),
  });
};
