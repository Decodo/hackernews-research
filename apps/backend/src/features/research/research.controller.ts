import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RunResearchDto } from './dto/run-research.dto';
import { ResearchService, type ResearchProgressStage } from './research.service';

@Controller('research')
export class ResearchController {
  private readonly logger = new Logger(ResearchController.name);

  constructor(private readonly research: ResearchService) {}

  @Post()
  run(@Body() dto: RunResearchDto) {
    return this.research.run(dto);
  }

  @Post('stream')
  async stream(@Body() dto: RunResearchDto, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (payload: unknown) => res.write(`${JSON.stringify(payload)}\n`);
    try {
      const result = await this.research.run(dto, {
        onProgress: (stage: ResearchProgressStage) => send({ type: 'progress', stage }),
      });
      send({ type: 'result', result });
    } catch (error) {
      const e = error as { response?: { message?: string }; message?: string; stack?: string };
      const message = e.response?.message ?? e.message ?? 'Research failed';
      this.logger.error(`Research stream failed: ${message}`, e.stack);
      send({ type: 'error', message });
    } finally {
      res.end();
    }
  }
}
