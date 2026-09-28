import { Module } from '@nestjs/common';
import { HackerNewsService } from './hacker-news.service';

@Module({ providers: [HackerNewsService], exports: [HackerNewsService] })
export class HackerNewsModule {}
