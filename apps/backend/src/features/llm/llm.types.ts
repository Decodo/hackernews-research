export type LlmProvider = 'claude' | 'openai' | 'gemini';
export type LlmPurpose = 'general' | 'triage' | 'analysis';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  provider?: LlmProvider;
  model?: string;
  purpose?: LlmPurpose;
  responseFormat?: 'text' | 'json';
  maxOutputTokens?: number;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmResponse {
  content: string;
  provider: LlmProvider;
  model: string;
  usage?: LlmUsage;
  stopReason?: string;
}
