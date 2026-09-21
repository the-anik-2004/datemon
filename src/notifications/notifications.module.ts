import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsScheduler } from './notifications.scheduler.js';
import { NotificationsController } from './notifications.controller.js';
import { PushService } from './push.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsScheduler, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}