import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { HnResearchConfig } from '../hacker-news/hacker-news.types';

export type MonitorDocument = HydratedDocument<Monitor>;

@Schema({ timestamps: true })
export class Monitor {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Object, required: true })
  plan: HnResearchConfig;

  @Prop({ required: true, enum: ['custom-hours', 'daily', 'weekly', 'monthly'] })
  cadence: 'custom-hours' | 'daily' | 'weekly' | 'monthly';

  @Prop({ type: Number })
  intervalHours?: number;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ type: Date, required: true })
  nextRunAt: Date;

  @Prop({ type: Date })
  lastRunAt?: Date;

  @Prop({ type: String })
  lastQueryId?: string;

  @Prop({ type: String })
  lastError?: string;

  @Prop({ type: Date })
  currentRunStartedAt?: Date;
}

export const MonitorSchema = SchemaFactory.createForClass(Monitor);
