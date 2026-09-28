export const LLM_DEFAULTS = {
  claude: { model: 'claude-sonnet-4-6', triageModel: 'claude-haiku-4-5-20251001' },
  openai: { model: 'gpt-4o', triageModel: 'gpt-4o-mini' },
  gemini: { model: 'gemini-2.5-flash', triageModel: 'gemini-2.5-flash' },
} as const;
