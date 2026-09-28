import { IsIn, IsOptional, IsString } from 'class-validator';

export class TestCredentialDto {
  @IsIn(['anthropic', 'openai', 'gemini', 'decodo'])
  target: 'anthropic' | 'openai' | 'gemini' | 'decodo';

  /** Optional unsaved credential from the Settings form. */
  @IsOptional()
  @IsString()
  credential?: string;
}
