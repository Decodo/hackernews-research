import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { HnResearchConfig, ResearchStoryRecord } from '../hacker-news/hacker-news.types';
import { Query, QueryDocument } from './queries.schema';

export interface CreateQueryDto {
  prompt: string;
  plan: HnResearchConfig;
  stories: ResearchStoryRecord[];
  report: Record<string, unknown>;
  stats: Record<string, unknown>;
  monitorId?: string;
  monitorName?: string;
  runType?: 'manual' | 'scheduled' | 'manual-monitor';
}

@Injectable()
export class QueriesService {
  constructor(@InjectModel(Query.name) private readonly queryModel: Model<QueryDocument>) {}

  async create(dto: CreateQueryDto) {
    return new this.queryModel(dto).save();
  }

  async findAll() {
    return this.queryModel.find().select('-stories').sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string) {
    const query = await this.queryModel.findById(id).exec();
    if (!query) throw new NotFoundException(`Query ${id} not found`);
    return query;
  }

  async remove(id: string) {
    const query = await this.queryModel.findByIdAndDelete(id).exec();
    if (!query) throw new NotFoundException(`Query ${id} not found`);
  }
}
