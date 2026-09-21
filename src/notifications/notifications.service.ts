import { Injectable, Logger } from '@nestjs/common';
import { Reminder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // ============================================================
  // SCHEDULE — called by RemindersService on create/update/complete/snooze
  // ============================================================
  async scheduleForReminder(reminder: Reminder): Promise<void> {
    // 1. Cancel any existing PENDING notification for this reminder
    await this.cancelPendingForReminder(reminder.id);

    // 2. Don't schedule for reminders that are already done
    if (reminder.status !== 'ACTIVE') return;

    // 3. Don't schedule for reminders in the past (edge case)
    if (reminder.scheduledAt <= new Date()) return;

    // 4. Create a new PENDING notification
    await this.prisma.notification.create({
      data: {
        userId: reminder.userId,
        reminderId: reminder.id,
        scheduledAt: reminder.scheduledAt,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `Scheduled notification for reminder ${reminder.id} at ${reminder.scheduledAt.toISOString()}`,
    );
  }

  // ============================================================
  // CANCEL — called when reminder is deleted, completed, snoozed
  // ============================================================
  async cancelPendingForReminder(reminderId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { reminderId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return result.count;
  }

  // ============================================================
  // READ — for GET /notifications
  // ============================================================
  async findAllForUser(userId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      include: {
        reminder: { select: { id: true, title: true } },
      },
    });
  }

  // ============================================================
  // PROCESSING — the worker's job
  // ============================================================

  /**
   * Find due notifications and process them.
   * Returns how many were processed.
   */
  async processDueNotifications(batchSize = 100): Promise<number> {
    const now = new Date();

    const candidates = await this.prisma.notification.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: now },
      },
      take: batchSize,
      orderBy: { scheduledAt: 'asc' },
      include: { reminder: true, user: { include: { devices: true } } },
    });

    if (candidates.length === 0) return 0;

    let processed = 0;

    for (const notification of candidates) {
      // Atomic claim: only one worker gets this row
      const claimed = await this.prisma.notification.updateMany({
        where: { id: notification.id, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });

      if (claimed.count === 0) {
        // Someone else already took it
        continue;
      }

      // We own it. Try to send.
      try {
        await this.deliver(notification);
        processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to deliver notification ${notification.id}: ${message}`,
        );
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'FAILED',
            error: message,
          },
        });
      }
    }

    return processed;
  }

  // ============================================================
  // DELIVER — send to all of user's devices
  // ============================================================
  private async deliver(notification: {
    id: string;
    userId: string;
    reminderId: string;
    reminder: Reminder;
    user: { devices: { pushToken: string }[] };
  }) {
    const tokens = notification.user.devices.map((d) => d.pushToken);

    if (tokens.length === 0) {
      this.logger.warn(
        `No devices registered for user ${notification.userId}, notification ${notification.id} cancelled`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'CANCELLED',
          error: 'No devices registered',
        },
      });
      return;
    }

    const title = 'DATEMON 🔔';
    const body = this.formatBody(notification.reminder);

    const results = await this.push.send(tokens, title, body, {
      reminderId: notification.reminderId,
      notificationId: notification.id,
    });

    const anySuccess = results.some((r) => r.success);
    const allSuccess = results.every((r) => r.success);

    if (allSuccess) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      this.logger.log(`Notification ${notification.id} sent to ${tokens.length} devices`);
    } else if (anySuccess) {
      // Partial: some devices got it. Treat as SENT but record the error.
      const errors = results
        .filter((r) => !r.success)
        .map((r) => r.error)
        .join('; ');
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          error: `Partial: ${errors}`,
        },
      });
      this.logger.warn(
        `Notification ${notification.id} partially sent: ${errors}`,
      );
    } else {
      throw new Error(
        results.map((r) => r.error).filter(Boolean).join('; ') || 'All sends failed',
      );
    }
  }

  private formatBody(reminder: Reminder): string {
    const time = reminder.scheduledAt.toISOString().substring(11, 16); // "HH:mm"
    return `${reminder.title} — due at ${time} UTC`;
  }
}