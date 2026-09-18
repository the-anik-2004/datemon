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
import { ReminderStatus, Prisma } from '@prisma/client';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CREATE
  // ============================================================
  async create(userId: string, dto: CreateReminderDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    this.assertValidSchedule(scheduledAt, dto.recurrenceType);

    return this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description ?? null,
        scheduledAt,
        priority: dto.priority ?? 'NORMAL',
        category: dto.category ?? 'OTHER',
        recurrenceType: dto.recurrenceType ?? 'NONE',
        recurrenceData: dto.recurrenceData
          ? (dto.recurrenceData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
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
      take: query.take ?? 50,
      skip: query.skip ?? 0,
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
    if (dto.recurrenceType !== undefined) data.recurrenceType = dto.recurrenceType;
    if (dto.recurrenceData !== undefined) {
      data.recurrenceData = dto.recurrenceData as Prisma.InputJsonValue;
    }
    if (dto.scheduledAt !== undefined) {
      const scheduledAt = new Date(dto.scheduledAt);
      const recurrenceType = dto.recurrenceType ?? existingReminder.recurrenceType;
      this.assertValidSchedule(scheduledAt, recurrenceType);
      data.scheduledAt = scheduledAt;
    }

    return this.prisma.reminder.update({ where: { id }, data });
  }

  // ============================================================
  // DELETE
  // ============================================================
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.reminder.delete({ where: { id } });
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

    // For recurring reminders, completing an occurrence advances to the next one.
    // For V1, we mark COMPLETED. Recurrence rollover is handled in Step 6.
    if (reminder.recurrenceType !== 'NONE') {
      // Recurring — leave it ACTIVE, just record completion timestamp
      // Step 6 will compute the new scheduledAt
      return this.prisma.reminder.update({
        where: { id },
        data: { completedAt: new Date() },
      });
    }

    return this.prisma.reminder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  // ============================================================
  // CANCEL
  // ============================================================
  async cancel(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
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
        newTime = new Date(now);
        newTime.setDate(newTime.getDate() + 1);
        // Same time tomorrow
        newTime.setHours(
          reminder.scheduledAt.getHours(),
          reminder.scheduledAt.getMinutes(),
          0,
          0,
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

    return this.prisma.reminder.update({
      where: { id },
      data: { scheduledAt: newTime },
    });
  }

  // ============================================================
  // DASHBOARD — grouped view
  // ============================================================
  async dashboard(userId: string) {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const startOfNextWeek = new Date(startOfToday);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

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