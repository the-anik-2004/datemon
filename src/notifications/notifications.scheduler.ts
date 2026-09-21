import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service.js';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);
  private isRunning = false;

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    // Guard: if previous run is still going, skip this tick
    if (this.isRunning) {
      this.logger.warn('Skipping tick — previous run still in progress');
      return;
    }
    this.isRunning = true;

    try {
      const processed = await this.notifications.processDueNotifications();
      if (processed > 0) {
        this.logger.log(`Processed ${processed} notifications`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Scheduler tick failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }
}