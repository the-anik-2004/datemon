import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorators.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '50', 10);
    const safeLimit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 200)
      : 50;
    return this.notificationsService.findAllForUser(user.id, safeLimit);
  }
}