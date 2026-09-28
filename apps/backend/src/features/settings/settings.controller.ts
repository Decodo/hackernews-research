import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { TestCredentialDto } from './dto/test-credential.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /settings — returns config status only, never credential values. */
  @Get()
  async getStatus() {
    return this.settingsService.getStatus();
  }

  /**
   * PATCH /settings
   * Updates provider/model preferences and optional credential overrides.
   * Blank credential strings are ignored; explicit clear flags restore .env fallback.
   */
  @Patch()
  @HttpCode(HttpStatus.OK)
  async update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }

  /** POST /settings/test — validates a saved/effective or unsaved credential. */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testCredential(@Body() dto: TestCredentialDto) {
    return this.settingsService.testCredential(dto);
  }
}
