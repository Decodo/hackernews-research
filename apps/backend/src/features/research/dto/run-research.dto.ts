import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { HnSource, ResearchDepth } from '../../hacker-news/hacker-news.types';

export class RunResearchDto {
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

  @IsOptional()
  @IsString()
  monitorId?: string;

  @IsOptional()
  @IsString()
  monitorName?: string;
}
