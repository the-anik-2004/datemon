import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorators.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AiService } from './ai.service.js';
import { ParseReminderDto } from './dto/parse-reminder.dto.js';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('parse-reminder')
  @HttpCode(200)
  parse(
    @CurrentUser() user: { id: string },
    @Body() dto: ParseReminderDto,
  ) {
    return this.aiService.parseReminder(user.id, dto.text);
  }
}
