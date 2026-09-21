import { Injectable } from '@nestjs/common';
import { RecurrenceType, Reminder } from '@prisma/client';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import {
  WeeklyRecurrenceData,
  MonthlyRecurrenceData,
  YearlyRecurrenceData,
} from './recurrence.types.js';

interface NextOccurrenceInput {
  recurrenceType: RecurrenceType;
  recurrenceData: unknown;
  currentScheduledAt: Date;
  timezone: string;
  from?: Date; // optional; defaults to now()
}

@Injectable()
export class RecurrenceCalculator {
  /**
   * Returns the NEXT occurrence of a recurring reminder as a UTC Date,
   * or null if the reminder is not recurring.
   *
   * The returned Date is strictly greater than `from` (default: now()).
   * If the current occurrence is in the future, the next one is the one
   * AFTER it — we never return the same occurrence we started from.
   */
  getNextOccurrence(input: NextOccurrenceInput): Date | null {
    const { recurrenceType, recurrenceData, currentScheduledAt, timezone } = input;
    const from = input.from ?? new Date();

    if (recurrenceType === 'NONE') return null;

    const data = recurrenceData as Record<string, unknown>;
    const time = (data.time as string) ?? '09:00';

    switch (recurrenceType) {
      case 'DAILY':
        return this.nextDaily(currentScheduledAt, time, timezone, from);
      case 'WEEKLY':
        return this.nextWeekly(
          data as unknown as WeeklyRecurrenceData,
          currentScheduledAt,
          timezone,
          from,
        );
      case 'MONTHLY':
        return this.nextMonthly(
          data as unknown as MonthlyRecurrenceData,
          currentScheduledAt,
          timezone,
          from,
        );
      case 'YEARLY':
        return this.nextYearly(
          data as unknown as YearlyRecurrenceData,
          currentScheduledAt,
          timezone,
          from,
        );
      default:
        return null;
    }
  }

  // ============================================================
  // DAILY
  // ============================================================
  private nextDaily(
    current: Date,
    time: string,
    timezone: string,
    from: Date,
  ): Date {
    // Start from the later of (current + 1 day) or (from)
    const base = new Date(Math.max(current.getTime(), from.getTime()));
    const [h, m] = time.split(':').map(Number);

    // Get base date in user's timezone, then build the same day at HH:mm local
    const zonedBase = toZonedTime(base, timezone);
    const next = new Date(zonedBase);
    next.setHours(h, m, 0, 0);
    next.setDate(next.getDate() + 1); // tomorrow at HH:mm

    // If that's still <= current, add another day
    let candidate = fromZonedTime(next, timezone);
    while (candidate <= current || candidate <= from) {
      next.setDate(next.getDate() + 1);
      candidate = fromZonedTime(next, timezone);
    }
    return candidate;
  }

  // ============================================================
  // WEEKLY
  // ============================================================
  private nextWeekly(
    data: WeeklyRecurrenceData,
    current: Date,
    timezone: string,
    from: Date,
  ): Date {
    const [h, m] = data.time.split(':').map(Number);
    const targetDow = data.dayOfWeek;

    // Start looking from the later of (current + 1s) or (from)
    const base = new Date(Math.max(current.getTime(), from.getTime()));
    const zonedBase = toZonedTime(base, timezone);

    // Advance day-by-day until we hit the target day-of-week with time > base
    for (let i = 1; i <= 8; i++) {
      const candidateZoned = new Date(zonedBase);
      candidateZoned.setDate(candidateZoned.getDate() + i);
      candidateZoned.setHours(h, m, 0, 0);

      if (candidateZoned.getDay() !== targetDow) continue;

      const candidateUtc = fromZonedTime(candidateZoned, timezone);
      if (candidateUtc > current && candidateUtc > from) {
        return candidateUtc;
      }
    }
    // Should never reach here
    throw new Error('nextWeekly: no candidate found in 8 days');
  }

  // ============================================================
  // MONTHLY
  // ============================================================
  private nextMonthly(
    data: MonthlyRecurrenceData,
    current: Date,
    timezone: string,
    from: Date,
  ): Date {
    const [h, m] = data.time.split(':').map(Number);
    const targetDay = data.dayOfMonth;

    const base = new Date(Math.max(current.getTime(), from.getTime()));
    const zonedBase = toZonedTime(base, timezone);

    // Try up to 24 months ahead
    for (let offset = 0; offset < 24; offset++) {
      const year = zonedBase.getFullYear();
      const month = zonedBase.getMonth() + offset;

      // Build date in local TZ: year-month-day, adjusted for month overflow
      const candidateZoned = new Date(year, month, 1);
      const daysInMonth = new Date(
        candidateZoned.getFullYear(),
        candidateZoned.getMonth() + 1,
        0,
      ).getDate();

      // Clamp: if dayOfMonth is 31 but month has 30 days, use 30
      const day = Math.min(targetDay, daysInMonth);

      candidateZoned.setDate(day);
      candidateZoned.setHours(h, m, 0, 0);

      const candidateUtc = fromZonedTime(candidateZoned, timezone);
      if (candidateUtc > current && candidateUtc > from) {
        return candidateUtc;
      }
    }
    throw new Error('nextMonthly: no candidate found in 24 months');
  }

  // ============================================================
  // YEARLY
  // ============================================================
  private nextYearly(
    data: YearlyRecurrenceData,
    current: Date,
    timezone: string,
    from: Date,
  ): Date {
    const [h, m] = data.time.split(':').map(Number);
    const targetMonth = data.month - 1; // JS months are 0-indexed
    const targetDay = data.day;

    const base = new Date(Math.max(current.getTime(), from.getTime()));
    const zonedBase = toZonedTime(base, timezone);

    for (let offset = 0; offset < 5; offset++) {
      const year = zonedBase.getFullYear() + offset;
      const candidateZoned = new Date(year, targetMonth, 1);

      const daysInMonth = new Date(year, targetMonth + 1, 0).getDate();
      const day = Math.min(targetDay, daysInMonth); // Feb 29 → Feb 28 on non-leap years

      candidateZoned.setDate(day);
      candidateZoned.setHours(h, m, 0, 0);

      const candidateUtc = fromZonedTime(candidateZoned, timezone);
      if (candidateUtc > current && candidateUtc > from) {
        return candidateUtc;
      }
    }
    throw new Error('nextYearly: no candidate found in 5 years');
  }
}