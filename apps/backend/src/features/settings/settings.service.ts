import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '../../shared/config/config.service';
import { Settings, SettingsDocument } from './settings.schema';

export interface EffectiveConfig {
  provider: string;
  model: string;
  triageModel: string;
  decodoAuthToken: string;
  decodoScraperEndpoint: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
}

export type CredentialSource = 'settings' | 'environment' | 'none';

export interface SettingsStatus {
  provider: string;
  model: string;
  decodoKeySet: boolean;
  anthropicKeySet: boolean;
  openaiKeySet: boolean;
  geminiKeySet: boolean;
  decodoKeySource: CredentialSource;
  anthropicKeySource: CredentialSource;
  openaiKeySource: CredentialSource;
  geminiKeySource: CredentialSource;
}

export interface CredentialTestResult {
  ok: boolean;
  target: 'anthropic' | 'openai' | 'gemini' | 'decodo';
  message: string;
}

type CredentialUpdateInput = {
  provider?: string;
  model?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  decodoAuthToken?: string;
  clearAnthropicApiKey?: boolean;
  clearOpenaiApiKey?: boolean;
  clearGeminiApiKey?: boolean;
  clearDecodoAuthToken?: boolean;
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
    private readonly configService: ConfigService,
  ) {}

  private async getSettingsDocumentWithCredentials(): Promise<SettingsDocument | null> {
    try {
      return await this.settingsModel
        .findOne({ key: 'global' })
        .select('+anthropicApiKey +openaiApiKey +geminiApiKey +decodoAuthToken')
        .exec();
    } catch (err) {
      this.logger.warn(`Failed to read settings from DB: ${String(err)}`);
      return null;
    }
  }

  async getEffectiveConfig(): Promise<EffectiveConfig> {
    const doc = await this.getSettingsDocumentWithCredentials();
    const envLlm = this.configService.llm;
    const envDecodo = this.configService.decodo;

    return {
      // Provider and model: DB selection overrides env, env overrides default.
      provider: doc?.provider || envLlm.provider || 'claude',
      model: doc?.model || envLlm.model || '',
      triageModel: envLlm.triageModel || '',
      // Credentials saved in Settings override environment variables.
      decodoAuthToken: doc?.decodoAuthToken || envDecodo.authToken || '',
      decodoScraperEndpoint:
        envDecodo.scraperEndpoint || 'https://scraper-api.decodo.com/v2/scrape',
      anthropicApiKey: doc?.anthropicApiKey || envLlm.anthropicApiKey || '',
      openaiApiKey: doc?.openaiApiKey || envLlm.openaiApiKey || '',
      geminiApiKey: doc?.geminiApiKey || envLlm.geminiApiKey || '',
    };
  }

  async getStatus(): Promise<SettingsStatus> {
    const doc = await this.getSettingsDocumentWithCredentials();
    const envLlm = this.configService.llm;
    const envDecodo = this.configService.decodo;

    const source = (saved?: string, env?: string): CredentialSource =>
      saved ? 'settings' : env ? 'environment' : 'none';

    const anthropicKeySource = source(doc?.anthropicApiKey, envLlm.anthropicApiKey);
    const openaiKeySource = source(doc?.openaiApiKey, envLlm.openaiApiKey);
    const geminiKeySource = source(doc?.geminiApiKey, envLlm.geminiApiKey);
    const decodoKeySource = source(doc?.decodoAuthToken, envDecodo.authToken);

    return {
      provider: doc?.provider || envLlm.provider || 'claude',
      model: doc?.model || envLlm.model || '',
      decodoKeySet: decodoKeySource !== 'none',
      anthropicKeySet: anthropicKeySource !== 'none',
      openaiKeySet: openaiKeySource !== 'none',
      geminiKeySet: geminiKeySource !== 'none',
      decodoKeySource,
      anthropicKeySource,
      openaiKeySource,
      geminiKeySource,
    };
  }

  async update(input: CredentialUpdateInput): Promise<SettingsStatus> {
    const setPatch: Record<string, string> = {};
    const unsetPatch: Record<string, 1> = {};

    if (input.provider) setPatch.provider = input.provider;
    // Clear model when provider changes so a stale model from another provider isn't used.
    if (input.provider) setPatch.model = '';
    // Allow explicit model override (empty string resets to provider default).
    if (input.model !== undefined) setPatch.model = input.model.trim();

    const applyCredential = (
      field: 'anthropicApiKey' | 'openaiApiKey' | 'geminiApiKey' | 'decodoAuthToken',
      value: string | undefined,
      clear: boolean | undefined,
    ) => {
      if (clear) {
        unsetPatch[field] = 1;
        return;
      }
      const trimmed = value?.trim();
      // Blank credential inputs mean "keep the current credential". Explicit clear
      // buttons use the clear* flags above.
      if (trimmed) setPatch[field] = trimmed;
    };

    applyCredential('anthropicApiKey', input.anthropicApiKey, input.clearAnthropicApiKey);
    applyCredential('openaiApiKey', input.openaiApiKey, input.clearOpenaiApiKey);
    applyCredential('geminiApiKey', input.geminiApiKey, input.clearGeminiApiKey);
    applyCredential('decodoAuthToken', input.decodoAuthToken, input.clearDecodoAuthToken);

    const changedFields = [...Object.keys(setPatch), ...Object.keys(unsetPatch)].filter(
      (field) => !field.toLowerCase().includes('apikey') && field !== 'decodoAuthToken',
    );
    const credentialFieldsChanged = [
      'anthropicApiKey',
      'openaiApiKey',
      'geminiApiKey',
      'decodoAuthToken',
    ].filter((field) => field in setPatch || field in unsetPatch);
    this.logger.log(
      `[Settings] Updating ${[
        ...changedFields,
        ...credentialFieldsChanged.map((field) => `${field}(secret)`),
      ].join(', ') || 'no fields'}`,
    );

    const update: { $set?: Record<string, string>; $unset?: Record<string, 1> } = {};
    if (Object.keys(setPatch).length) update.$set = setPatch;
    if (Object.keys(unsetPatch).length) update.$unset = unsetPatch;

    if (Object.keys(update).length) {
      await this.settingsModel
        .findOneAndUpdate({ key: 'global' }, update, { upsert: true, new: true })
        .exec();
    }

    return this.getStatus();
  }

  async testCredential(input: {
    target: 'anthropic' | 'openai' | 'gemini' | 'decodo';
    credential?: string;
  }): Promise<CredentialTestResult> {
    const config = await this.getEffectiveConfig();
    const supplied = input.credential?.trim();
    const credential =
      supplied ||
      (input.target === 'anthropic'
        ? config.anthropicApiKey
        : input.target === 'openai'
          ? config.openaiApiKey
          : input.target === 'gemini'
            ? config.geminiApiKey
            : config.decodoAuthToken);

    if (!credential) {
      return {
        ok: false,
        target: input.target,
        message: 'No credential is configured. Paste one above or configure the environment fallback.',
      };
    }

    try {
      if (input.target === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/models?limit=1', {
          signal: AbortSignal.timeout(15_000),
          headers: {
            'x-api-key': credential,
            'anthropic-version': '2023-06-01',
          },
        });
        return this.testResultFromResponse(input.target, response, 'Anthropic credential is valid.');
      }

      if (input.target === 'openai') {
        const response = await fetch('https://api.openai.com/v1/models', {
          signal: AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${credential}` },
        });
        return this.testResultFromResponse(input.target, response, 'OpenAI credential is valid.');
      }

      if (input.target === 'gemini') {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
          { signal: AbortSignal.timeout(15_000), headers: { 'x-goog-api-key': credential } },
        );
        return this.testResultFromResponse(input.target, response, 'Gemini credential is valid.');
      }

      const response = await fetch(config.decodoScraperEndpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${credential}`,
        },
        body: JSON.stringify({
          target: 'universal',
          url: 'https://example.com/',
          proxy_pool: 'premium',
          headless: 'html',
          markdown: true,
        }),
      });
      return this.testResultFromResponse(
        input.target,
        response,
        'Decodo Web Scraping API credential is valid.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        target: input.target,
        message: `Connection test failed: ${message}`,
      };
    }
  }

  private async testResultFromResponse(
    target: CredentialTestResult['target'],
    response: Response,
    successMessage: string,
  ): Promise<CredentialTestResult> {
    if (response.ok) return { ok: true, target, message: successMessage };

    let detail = '';
    try {
      detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 180);
    } catch {
      // Keep the status-only message when the provider returns no readable body.
    }

    const authFailure = response.status === 401 || response.status === 403;
    return {
      ok: false,
      target,
      message: authFailure
        ? `Authentication failed (${response.status}). Check the credential and try again.`
        : `Provider returned ${response.status}${detail ? `: ${detail}` : ''}`,
    };
  }
}
