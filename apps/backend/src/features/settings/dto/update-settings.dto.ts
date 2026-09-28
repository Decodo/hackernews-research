import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['claude', 'openai', 'gemini'])
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  geminiApiKey?: string;

  @IsOptional()
  @IsString()
  decodoAuthToken?: string;

  @IsOptional()
  @IsBoolean()
  clearAnthropicApiKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearOpenaiApiKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearGeminiApiKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearDecodoAuthToken?: boolean;
}
