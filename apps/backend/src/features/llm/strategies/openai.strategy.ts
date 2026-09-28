import { BadRequestException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLM_DEFAULTS } from '../llm.constants';
import type { LlmResponse } from '../llm.types';
import type { LlmStrategy, LlmStrategyArgs } from './llm-strategy.interface';

export class OpenAiStrategy implements LlmStrategy {
  private readonly logger = new Logger(OpenAiStrategy.name);

  async complete({ request, config, signal }: LlmStrategyArgs): Promise<LlmResponse> {
    if (!config.openaiApiKey) {
      throw new BadRequestException('OPENAI_API_KEY is not configured');
    }

    const model = (request.model ?? config.model) || LLM_DEFAULTS.openai.model;
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    this.logger.log(`Calling OpenAI model: ${model}`);

    const response = await client.chat.completions.create(
      {
        model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(request.responseFormat === 'json'
          ? { response_format: { type: 'json_object' as const } }
          : {}),
        ...(request.maxOutputTokens ? { max_completion_tokens: request.maxOutputTokens } : {}),
      },
      { signal },
    );

    const content = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;
    return {
      content,
      provider: 'openai',
      model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: response.usage?.total_tokens,
      },
      stopReason: response.choices[0]?.finish_reason ?? undefined,
    };
  }
}
