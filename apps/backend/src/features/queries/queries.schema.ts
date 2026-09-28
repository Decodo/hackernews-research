import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { HnResearchConfig, ResearchStoryRecord } from '../hacker-news/hacker-news.types';

export type QueryDocument = HydratedDocument<Query>;

@Schema({ timestamps: true })
export class Query {
  @Prop({ required: true })
  prompt: string;

  @Prop({ type: Object, required: true })
  plan: HnResearchConfig;

  @Prop({ type: Array, default: [] })
  stories: ResearchStoryRecord[];

  @Prop({ type: Object, required: true })
  report: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  stats: Record<string, unknown>;

  @Prop({ type: String, index: true })
  monitorId?: string;

  @Prop({ type: String })
  monitorName?: string;

  @Prop({ type: String, enum: ['manual', 'scheduled', 'manual-monitor'], default: 'manual' })
  runType: 'manual' | 'scheduled' | 'manual-monitor';
}

export const QuerySchema = SchemaFactory.createForClass(Query);
