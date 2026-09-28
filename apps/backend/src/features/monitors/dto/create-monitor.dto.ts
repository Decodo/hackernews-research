import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { HnSource, ResearchDepth } from '../../hacker-news/hacker-news.types';

export class CreateMonitorDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(['top', 'new', 'ask', 'show'], { each: true })
  sources?: HnSource[];

  @IsOptional()
  @IsIn(['quick', 'standard', 'deep'])
  depth?: ResearchDepth;

  @IsIn(['custom-hours', 'daily', 'weekly', 'monthly'])
  cadence: 'custom-hours' | 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  intervalHours?: number;
}
