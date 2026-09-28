import { Module } from '@nestjs/common';
import { ConfigModule, DatabaseModule } from './shared';
import { QueriesModule } from './features/queries/queries.module';
import { SettingsModule } from './features/settings/settings.module';
import { ResearchModule } from './features/research/research.module';
import { MonitorsModule } from './features/monitors/monitors.module';

@Module({
  imports: [ConfigModule, DatabaseModule, QueriesModule, SettingsModule, ResearchModule, MonitorsModule],
})
export class AppModule {}
