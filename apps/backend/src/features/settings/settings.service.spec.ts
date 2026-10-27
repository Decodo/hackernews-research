import { SettingsService } from './settings.service';

describe('SettingsService Decodo credential test', () => {
  const endpoint = 'https://data.decodo.com/v1/scrape';
  const key = 'test-web-data-api-key';
  let service: SettingsService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new SettingsService(
      {} as ConstructorParameters<typeof SettingsService>[0],
      {} as ConstructorParameters<typeof SettingsService>[1],
    );
    jest.spyOn(service, 'getEffectiveConfig').mockResolvedValue({
      provider: 'claude',
      model: '',
      triageModel: '',
      decodoAuthToken: key,
      decodoScraperEndpoint: endpoint,
      anthropicApiKey: '',
      openaiApiKey: '',
      geminiApiKey: '',
    });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('tests the configured Web Data API key with Bearer authentication', async () => {
    fetchSpy.mockResolvedValue({ ok: true } as Response);

    await expect(service.testCredential({ target: 'decodo' })).resolves.toEqual({
      ok: true,
      target: 'decodo',
      message: 'Decodo Web Data API key is valid.',
    });
    expect(fetchSpy).toHaveBeenCalledWith(endpoint, {
      method: 'POST',
      signal: expect.any(AbortSignal),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        target: 'universal',
        url: 'https://example.com/',
        proxy_pool: 'premium',
        headless: 'html',
        markdown: true,
      }),
    });
  });

  it('reports authentication failures without exposing the key', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    const result = await service.testCredential({ target: 'decodo' });
    expect(result).toEqual({
      ok: false,
      target: 'decodo',
      message: 'Authentication failed (401). Check the credential and try again.',
    });
    expect(result.message).not.toContain(key);
  });
});
