import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReminderDto } from './dto/create-reminders.dto.js';
import { UpdateReminderDto } from './dto/update-reminders.dto.js';
import { QueryRemindersDto } from './dto/query-reminders.dto.js';
import { SnoozePreset, SnoozeReminderDto } from './dto/snooze-reminders.dto.js';
import { Prisma } from '@prisma/client';
import { RecurrenceValidator } from '../recurrence/recurrence.validator.js';
import { RecurrenceCalculator } from '../recurrence/recurrence.calculator.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class RemindersService {
  constructor(
  private readonly prisma: PrismaService,
  private readonly recurrenceValidator: RecurrenceValidator,
  private readonly recurrenceCalculator: RecurrenceCalculator,
  private readonly notifications: NotificationsService,
  ) {}

  // ============================================================
  // CREATE
  // ============================================================
  async create(userId: string, dto: CreateReminderDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    this.assertValidSchedule(scheduledAt, dto.recurrenceType);

    const recurrenceType = dto.recurrenceType ?? 'NONE';
    const recurrenceResult = this.recurrenceValidator.validate(
      recurrenceType,
      dto.recurrenceData,
    );
    if (!recurrenceResult.valid) {
      throw new BadRequestException(recurrenceResult.error);
    }

    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description ?? null,
        scheduledAt,
        priority: dto.priority ?? 'NORMAL',
        category: dto.category ?? 'OTHER',
        recurrenceType,
        recurrenceData: dto.recurrenceData
          ? (dto.recurrenceData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    await this.notifications.scheduleForReminder(reminder);
    return reminder;
  }

  // ============================================================
  // LIST (with filters)
  // ============================================================
  async findAll(userId: string, query: QueryRemindersDto) {
    const where: Prisma.ReminderWhereInput = {
      userId, // ← ownership
      status: query.status ?? undefined,
      priority: query.priority ?? undefined,
      category: query.category ?? undefined,
    };

    if (query.from || query.to) {
      where.scheduledAt = {};
      if (query.from) where.scheduledAt.gte = new Date(query.from);
      if (query.to) where.scheduledAt.lte = new Date(query.to);
    }

    return this.prisma.reminder.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      take: Math.min(Math.max(query.take ?? 50, 1), 100),
      skip: Math.max(query.skip ?? 0, 0),
    });
  }

  // ============================================================
  // FIND ONE — ownership enforced in WHERE clause
  // ============================================================
  async findOne(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId }, // ← both, always
    });
    if (!reminder) {
      // 404 not 403 — don't reveal that the ID exists for someone else
      throw new NotFoundException('Reminder not found');
    }
    return reminder;
  }

  // ============================================================
  // UPDATE
  // ============================================================
  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const existingReminder = await this.findOne(userId, id);

    const data: Prisma.ReminderUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.category !== undefined) data.category = dto.category;
    const recurrenceType = dto.recurrenceType ?? existingReminder.recurrenceType;
    const recurrenceData = dto.recurrenceType === 'NONE'
      ? dto.recurrenceData ?? null
      : dto.recurrenceData ?? existingReminder.recurrenceData;
    const recurrenceResult = this.recurrenceValidator.validate(
      recurrenceType,
      recurrenceData,
    );
    if (!recurrenceResult.valid) {
      throw new BadRequestException(recurrenceResult.error);
    }
    if (dto.recurrenceType !== undefined) data.recurrenceType = dto.recurrenceType;
    if (dto.recurrenceData !== undefined || dto.recurrenceType === 'NONE') {
      data.recurrenceData = recurrenceData === null
        ? Prisma.JsonNull
        : recurrenceData as Prisma.InputJsonValue;
    }
    if (dto.scheduledAt !== undefined) {
      const scheduledAt = new Date(dto.scheduledAt);
      const recurrenceType = dto.recurrenceType ?? existingReminder.recurrenceType;
      this.assertValidSchedule(scheduledAt, recurrenceType);
      data.scheduledAt = scheduledAt;
    } else if (dto.recurrenceType === 'NONE') {
      this.assertValidSchedule(existingReminder.scheduledAt, 'NONE');
    }

    const reminder = await this.updateOwned(userId, id, data);
    await this.notifications.scheduleForReminder(reminder);
    return reminder;
  }

  // ============================================================
  // DELETE
  // ============================================================
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.notifications.cancelPendingForReminder(id);
    const result = await this.prisma.reminder.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Reminder not found');
    }
    return { success: true };
  }

  // ============================================================
  // COMPLETE
  // ============================================================
 async complete(userId: string, id: string) {
  const reminder = await this.findOne(userId, id);

  if (reminder.status === 'COMPLETED') {
    return reminder; // idempotent
  }

  if (reminder.status === 'CANCELLED') {
    throw new BadRequestException('Cannot complete a cancelled reminder');
  }

  // ---- Non-recurring: mark COMPLETED ----
  if (reminder.recurrenceType === 'NONE') {
    const completed = await this.updateOwned(userId, id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    await this.notifications.cancelPendingForReminder(id);
    return completed;
  }

  // ---- Recurring: advance scheduledAt to next occurrence ----
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (!user) throw new NotFoundException('User not found');

  const next = this.recurrenceCalculator.getNextOccurrence({
    recurrenceType: reminder.recurrenceType,
    recurrenceData: reminder.recurrenceData,
    currentScheduledAt: reminder.scheduledAt,
    timezone: user.timezone,
  });

  if (!next) {
    // Fallback: shouldn't happen for recurring types
    const completed = await this.updateOwned(userId, id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    await this.notifications.cancelPendingForReminder(id);
    return completed;
  }

  const advanced = await this.updateOwned(userId, id, {
    scheduledAt: next,
    status: 'ACTIVE',
    completedAt: null,
  });
  await this.notifications.scheduleForReminder(advanced);
  return advanced;
}

  // ============================================================
  // CANCEL
  // ============================================================
  async cancel(userId: string, id: string) {
    await this.findOne(userId, id);
    const cancelled = await this.updateOwned(userId, id, { status: 'CANCELLED' });
    await this.notifications.cancelPendingForReminder(id);
    return cancelled;
  }

  // ============================================================
  // SNOOZE
  // ============================================================
  async snooze(userId: string, id: string, dto: SnoozeReminderDto) {
    const reminder = await this.findOne(userId, id);

    if (reminder.status !== 'ACTIVE') {
      throw new BadRequestException('Only active reminders can be snoozed');
    }

    const now = new Date();
    let newTime: Date;

    switch (dto.preset) {
      case SnoozePreset.TEN_MINUTES:
        newTime = new Date(now.getTime() + 10 * 60 * 1000);
        break;
      case SnoozePreset.ONE_HOUR:
        newTime = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case SnoozePreset.TOMORROW: {
        const scheduledAt = reminder.scheduledAt;
        newTime = new Date(
          Date.UTC(
            scheduledAt.getUTCFullYear(),
            scheduledAt.getUTCMonth(),
            scheduledAt.getUTCDate() + 1,
            scheduledAt.getUTCHours(),
            scheduledAt.getUTCMinutes(),
            0,
            0,
          ),
        );
        break;
      }
      case SnoozePreset.CUSTOM: {
        if (!dto.customUntil) {
          throw new BadRequestException('customUntil required for CUSTOM preset');
        }
        newTime = new Date(dto.customUntil);
        if (newTime <= now) {
          throw new BadRequestException('customUntil must be in the future');
        }
        break;
      }
      default:
        throw new BadRequestException('Invalid snooze preset');
    }

    const snoozed = await this.updateOwned(userId, id, { scheduledAt: newTime });
    await this.notifications.scheduleForReminder(snoozed);
    return snoozed;
  }

  // ============================================================
  // PreviewNextOccurrence — grouped view
  // ============================================================
  async previewNextOccurrence(userId: string, id: string) {
  const reminder = await this.findOne(userId, id);

  if (reminder.recurrenceType === 'NONE') {
    return { next: null, reason: 'not_recurring' };
  }

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (!user) throw new NotFoundException('User not found');

  const next = this.recurrenceCalculator.getNextOccurrence({
    recurrenceType: reminder.recurrenceType,
    recurrenceData: reminder.recurrenceData,
    currentScheduledAt: reminder.scheduledAt,
    timezone: user.timezone,
  });

  return { next, timezone: user.timezone };
}

  // ============================================================
  // DASHBOARD — grouped view
  // ============================================================
  async dashboard(userId: string) {
    const now = new Date();

    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfNextWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    const reminders = await this.prisma.reminder.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const groups = {
      OVERDUE: [] as typeof reminders,
      TODAY: [] as typeof reminders,
      TOMORROW: [] as typeof reminders,
      THIS_WEEK: [] as typeof reminders,
      UPCOMING: [] as typeof reminders,
    };

    for (const r of reminders) {
      const t = r.scheduledAt;
      if (t < startOfToday) groups.OVERDUE.push(r);
      else if (t < startOfTomorrow) groups.TODAY.push(r);
      else if (t < new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000))
        groups.TOMORROW.push(r);
      else if (t < startOfNextWeek) groups.THIS_WEEK.push(r);
      else groups.UPCOMING.push(r);
    }

    return {
      generatedAt: now,
      counts: {
        OVERDUE: groups.OVERDUE.length,
        TODAY: groups.TODAY.length,
        TOMORROW: groups.TOMORROW.length,
        THIS_WEEK: groups.THIS_WEEK.length,
        UPCOMING: groups.UPCOMING.length,
      },
      groups,
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================
  private async updateOwned(
    userId: string,
    id: string,
    data: Prisma.ReminderUpdateManyMutationInput,
  ) {
    const result = await this.prisma.reminder.updateMany({
      where: { id, userId },
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException('Reminder not found');
    }
    return this.findOne(userId, id);
  }

  private assertValidSchedule(date: Date, recurrenceType?: string) {
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid scheduledAt');
    }
    // Non-recurring reminders must be in the future
    if ((!recurrenceType || recurrenceType === 'NONE') && date <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
  }
}