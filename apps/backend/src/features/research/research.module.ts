import { Module } from '@nestjs/common';
import { DecodoModule } from '../decodo/decodo.module';
import { HackerNewsModule } from '../hacker-news/hacker-news.module';
import { LlmModule } from '../llm/llm.module';
import { QueriesModule } from '../queries/queries.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [DecodoModule, HackerNewsModule, LlmModule, QueriesModule],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
