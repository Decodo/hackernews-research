import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SettingsDocument = HydratedDocument<Settings>;

/**
 * Stores the single-user app configuration.
 * Credential fields are excluded from normal Mongoose selections and are never
 * returned by the Settings API. SettingsService explicitly selects them only
 * when resolving runtime configuration.
 */
@Schema({ timestamps: true })
export class Settings {
  /** Always 'global' — only one settings document exists */
  @Prop({ default: 'global' })
  key: string;

  @Prop()
  provider?: string;

  @Prop()
  model?: string;

  @Prop({ select: false })
  anthropicApiKey?: string;

  @Prop({ select: false })
  openaiApiKey?: string;

  @Prop({ select: false })
  geminiApiKey?: string;

  @Prop({ select: false })
  decodoAuthToken?: string;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
SettingsSchema.index({ key: 1 }, { unique: true });
