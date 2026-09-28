import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DecodoService {
  private readonly logger = new Logger(DecodoService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async scrapeMarkdown(url: string, signal?: AbortSignal): Promise<string> {
    this.validateUrl(url);

    const config = await this.settingsService.getEffectiveConfig();
    if (!config.decodoAuthToken) {
      throw new BadRequestException('DECODO_AUTH_TOKEN must be configured.');
    }

    const response = await fetch(config.decodoScraperEndpoint, {
      method: 'POST',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${config.decodoAuthToken}`,
      },
      body: JSON.stringify({
        target: 'universal',
        url,
        proxy_pool: 'premium',
        headless: 'html',
        markdown: true,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Decodo Web Scraping API returned ${response.status}: ${text.slice(0, 300)}`,
      );
    }

    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Some successful responses may return the extracted content directly.
    }

    const markdown = this.extractText(payload)?.trim();
    if (!markdown) {
      throw new ServiceUnavailableException('Decodo response did not contain Markdown content.');
    }

    this.logger.log(`Scraped ${url} as Markdown via Web Scraping API · ${markdown.length.toLocaleString()} chars`);
    return markdown;
  }

  private validateUrl(value: string): void {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    } catch {
      throw new BadRequestException(`Cannot scrape invalid external URL: ${value}`);
    }
  }

  private extractText(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (!value || typeof value !== 'object') return undefined;

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = this.extractText(item);
        if (nested) return nested;
      }
      return undefined;
    }

    const object = value as Record<string, unknown>;
    for (const key of ['content', 'body', 'markdown', 'result', 'results', 'data']) {
      const nested = this.extractText(object[key]);
      if (nested) return nested;
    }
    return undefined;
  }
}
