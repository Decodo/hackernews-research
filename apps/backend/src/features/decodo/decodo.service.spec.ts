import { DecodoService } from './decodo.service';
import type { SettingsService } from '../settings/settings.service';

describe('DecodoService', () => {
  const endpoint = 'https://data.decodo.com/v1/scrape';
  const key = 'test-web-data-api-key';
  const url = 'https://example.com/story';
  let service: DecodoService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    const settingsService = {
      getEffectiveConfig: jest.fn().mockResolvedValue({
        decodoAuthToken: key,
        decodoScraperEndpoint: endpoint,
      }),
    } as unknown as SettingsService;
    service = new DecodoService(settingsService);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('retrieves Markdown with Bearer authentication and the existing scrape payload', async () => {
    const markdown = '# Example story\n\nUseful article content.';
    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ results: [{ content: markdown }] }),
    } as Response);

    await expect(service.scrapeMarkdown(url)).resolves.toBe(markdown);
    expect(fetchSpy).toHaveBeenCalledWith(endpoint, {
      method: 'POST',
      signal: undefined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'x-integration': 'oss-hackernews-research',
      },
      body: JSON.stringify({
        target: 'universal',
        url,
        proxy_pool: 'premium',
        headless: 'html',
        markdown: true,
      }),
    });
  });

  it('rejects missing credentials before sending an HTTP request', async () => {
    service = new DecodoService({
      getEffectiveConfig: jest.fn().mockResolvedValue({
        decodoAuthToken: '',
        decodoScraperEndpoint: endpoint,
      }),
    } as unknown as SettingsService);

    await expect(service.scrapeMarkdown(url)).rejects.toThrow('DECODO_AUTH_TOKEN must be configured.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('includes the HTTP status when Web Data API rejects a request', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(service.scrapeMarkdown(url)).rejects.toThrow('Decodo Web Data API returned 401');
  });
});
