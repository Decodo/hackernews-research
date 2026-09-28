import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { HnComment, HnSource, HnStory } from './hacker-news.types';

type HnItem = {
  id: number;
  deleted?: boolean;
  type?: 'job' | 'story' | 'comment' | 'poll' | 'pollopt';
  by?: string;
  time?: number;
  text?: string;
  dead?: boolean;
  parent?: number;
  kids?: number[];
  url?: string;
  score?: number;
  title?: string;
  descendants?: number;
};

const SOURCE_ENDPOINTS: Record<HnSource, string> = {
  top: 'topstories',
  new: 'newstories',
  ask: 'askstories',
  show: 'showstories',
};

const HN_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const HN_WEB_URL = 'https://news.ycombinator.com/item?id=';

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

@Injectable()
export class HackerNewsService {
  private readonly logger = new Logger(HackerNewsService.name);

  async collectStories(sources: HnSource[], candidateLimit: number): Promise<HnStory[]> {
    const sourceLists = await Promise.all(
      sources.map(async (source) => ({ source, ids: await this.fetchIdList(source) })),
    );

    const targetIds = new Map<number, { sources: HnSource[]; sourceRanks: Partial<Record<HnSource, number>> }>();
    const cursors = new Map<HnSource, number>(sources.map((source) => [source, 0]));
    const targetPoolSize = Math.ceil(candidateLimit * 1.3);

    while (targetIds.size < targetPoolSize) {
      let advanced = false;
      for (const { source, ids } of sourceLists) {
        const cursor = cursors.get(source) ?? 0;
        const id = ids[cursor];
        if (id === undefined) continue;
        advanced = true;
        cursors.set(source, cursor + 1);

        const existing = targetIds.get(id);
        if (existing) {
          if (!existing.sources.includes(source)) existing.sources.push(source);
          existing.sourceRanks[source] = cursor + 1;
        } else {
          targetIds.set(id, { sources: [source], sourceRanks: { [source]: cursor + 1 } });
        }
      }
      if (!advanced) break;
    }

    const entries = [...targetIds.entries()];
    const items = await mapWithConcurrency(entries, 12, async ([id, attribution]) => {
      const item = await this.fetchItem(id);
      return this.normalizeStory(item, attribution.sources, attribution.sourceRanks);
    });

    const stories = items.filter((story): story is HnStory => story !== null).slice(0, candidateLimit);
    this.logger.log(`Collected ${stories.length} Hacker News stories from ${sources.join(', ')}`);
    return stories;
  }

  async fetchComments(story: HnStory, maxComments: number, maxDepth = 2): Promise<HnComment[]> {
    const queue = story.kids.map((id) => ({ id, depth: 0 }));
    const comments: HnComment[] = [];

    while (queue.length && comments.length < maxComments) {
      const next = queue.shift();
      if (!next) break;
      const item = await this.fetchItem(next.id);
      if (!item) continue;

      if (next.depth < maxDepth && item.kids?.length) {
        queue.push(...item.kids.map((id) => ({ id, depth: next.depth + 1 })));
      }

      if (item.deleted || item.dead || item.type !== 'comment') continue;

      const text = this.toPlainText(item.text);
      if (text) {
        comments.push({
          id: item.id,
          by: item.by,
          time: item.time,
          text,
          depth: next.depth,
          parent: item.parent,
        });
      }

    }

    return comments;
  }

  private async fetchIdList(source: HnSource): Promise<number[]> {
    const response = await fetch(`${HN_BASE_URL}/${SOURCE_ENDPOINTS[source]}.json`);
    if (!response.ok) {
      throw new ServiceUnavailableException(`Hacker News API returned ${response.status} for ${source} stories.`);
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new ServiceUnavailableException(`Hacker News API returned an invalid ${source} story list.`);
    }
    return payload.filter((value): value is number => typeof value === 'number' && Number.isInteger(value));
  }

  private async fetchItem(id: number): Promise<HnItem | null> {
    const response = await fetch(`${HN_BASE_URL}/item/${id}.json`);
    if (!response.ok) {
      throw new ServiceUnavailableException(`Hacker News API returned ${response.status} for item ${id}.`);
    }
    const payload = (await response.json()) as HnItem | null;
    return payload;
  }

  private normalizeStory(
    item: HnItem | null,
    sources: HnSource[],
    sourceRanks: Partial<Record<HnSource, number>>,
  ): HnStory | null {
    if (!item || item.deleted || item.dead || item.type !== 'story' || !item.title || !item.id) return null;

    return {
      id: item.id,
      title: this.toPlainText(item.title) ?? item.title,
      url: item.url,
      hnUrl: `${HN_WEB_URL}${item.id}`,
      by: item.by ?? 'unknown',
      time: item.time ?? 0,
      score: item.score ?? 0,
      descendants: item.descendants ?? 0,
      text: this.toPlainText(item.text),
      kids: item.kids ?? [],
      sources,
      sourceRanks,
    };
  }

  private toPlainText(input?: string): string | undefined {
    if (!input?.trim()) return undefined;
    const $ = cheerio.load(`<div id="root">${input}</div>`);
    const text = $('#root').text().replace(/\s+/g, ' ').trim();
    return text || undefined;
  }
}
