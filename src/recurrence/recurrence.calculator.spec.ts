import { RecurrenceCalculator } from './recurrence.calculator.js';

describe('RecurrenceCalculator', () => {
  const calc = new RecurrenceCalculator();

  describe('NONE', () => {
    it('returns null', () => {
      expect(
        calc.getNextOccurrence({
          recurrenceType: 'NONE',
          recurrenceData: null,
          currentScheduledAt: new Date('2026-01-01T00:00:00Z'),
          timezone: 'UTC',
        }),
      ).toBeNull();
    });
  });

  describe('DAILY', () => {
    it('advances by exactly one day', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'DAILY',
        recurrenceData: { time: '09:00' },
        currentScheduledAt: new Date('2026-03-10T09:00:00Z'),
        timezone: 'UTC',
        from: new Date('2026-03-10T08:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2026-03-11T09:00:00.000Z');
    });

    it('skips today if time has passed', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'DAILY',
        recurrenceData: { time: '09:00' },
        currentScheduledAt: new Date('2026-03-10T09:00:00Z'),
        timezone: 'UTC',
        from: new Date('2026-03-15T12:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2026-03-16T09:00:00.000Z');
    });
  });

  describe('WEEKLY', () => {
    it('lands on the correct day-of-week', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'WEEKLY',
        recurrenceData: { dayOfWeek: 0, time: '19:00' },
        currentScheduledAt: new Date('2026-03-10T19:00:00Z'),
        timezone: 'UTC',
        from: new Date('2026-03-10T19:00:01Z'),
      });
      expect(next?.toISOString()).toBe('2026-03-15T19:00:00.000Z');
    });
  });

  describe('MONTHLY', () => {
    it('lands on the same day next month', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'MONTHLY',
        recurrenceData: { dayOfMonth: 5, time: '09:00' },
        currentScheduledAt: new Date('2026-03-05T09:00:00Z'),
        timezone: 'UTC',
        from: new Date('2026-03-05T10:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2026-04-05T09:00:00.000Z');
    });

    it('clamps day 31 to the last day of short months', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'MONTHLY',
        recurrenceData: { dayOfMonth: 31, time: '09:00' },
        currentScheduledAt: new Date('2026-01-31T09:00:00Z'),
        timezone: 'UTC',
        from: new Date('2026-01-31T10:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2026-02-28T09:00:00.000Z');
    });
  });

  describe('YEARLY', () => {
    it('lands on the same month/day next year', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'YEARLY',
        recurrenceData: { month: 10, day: 18, time: '09:00' },
        currentScheduledAt: new Date('2026-10-18T09:00:00Z'),
        timezone: 'UTC',
        from: new Date('2026-10-18T10:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2027-10-18T09:00:00.000Z');
    });

    it('clamps Feb 29 to Feb 28 in non-leap years', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'YEARLY',
        recurrenceData: { month: 2, day: 29, time: '09:00' },
        currentScheduledAt: new Date('2024-02-29T09:00:00Z'),
        timezone: 'UTC',
        from: new Date('2024-02-29T10:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2025-02-28T09:00:00.000Z');
    });
  });

  describe('timezone handling', () => {
    it('fires at 9 AM IST, not 9 AM UTC', () => {
      const next = calc.getNextOccurrence({
        recurrenceType: 'DAILY',
        recurrenceData: { time: '09:00' },
        currentScheduledAt: new Date('2026-03-10T03:30:00Z'),
        timezone: 'Asia/Kolkata',
        from: new Date('2026-03-10T04:00:00Z'),
      });
      expect(next?.toISOString()).toBe('2026-03-11T03:30:00.000Z');
    });
  });
});