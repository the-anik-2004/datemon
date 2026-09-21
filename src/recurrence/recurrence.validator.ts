import { Injectable } from '@nestjs/common';
import { RecurrenceType } from '@prisma/client';
import { RecurrenceValidationResult } from './recurrence.types.js';

@Injectable()
export class RecurrenceValidator {
  /**
   * Validates that recurrenceData matches the shape required by recurrenceType.
   * Called from the service layer (not from DTO decorators) so we have full
   * access to both fields together.
   */
  validate(
    type: RecurrenceType,
    data: unknown,
  ): RecurrenceValidationResult {
    if (type === 'NONE') {
      if (data !== null && data !== undefined) {
        return { valid: false, error: 'recurrenceData must be null when type is NONE' };
      }
      return { valid: true };
    }

    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'recurrenceData is required for recurring reminders' };
    }

    const d = data as Record<string, unknown>;

    switch (type) {
      case 'DAILY':
        return this.validateTime(d.time) ?? { valid: true };
      case 'WEEKLY':
        return (
          this.validateDayOfWeek(d.dayOfWeek) ??
          this.validateTime(d.time) ??
          { valid: true }
        );
      case 'MONTHLY':
        return (
          this.validateDayOfMonth(d.dayOfMonth) ??
          this.validateTime(d.time) ??
          { valid: true }
        );
      case 'YEARLY':
        return (
          this.validateMonth(d.month) ??
          this.validateDay(d.day) ??
          this.validateTime(d.time) ??
          { valid: true }
        );
      default:
        return { valid: false, error: `Unsupported recurrenceType: ${type}` };
    }
  }

  private validateTime(time: unknown): RecurrenceValidationResult | null {
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return { valid: false, error: 'time must be "HH:mm" in 24-hour format' };
    }
    return null;
  }

  private validateDayOfWeek(d: unknown): RecurrenceValidationResult | null {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) {
      return { valid: false, error: 'dayOfWeek must be an integer from 0 (Sun) to 6 (Sat)' };
    }
    return null;
  }

  private validateDayOfMonth(d: unknown): RecurrenceValidationResult | null {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 31) {
      return { valid: false, error: 'dayOfMonth must be an integer from 1 to 31' };
    }
    return null;
  }

  private validateMonth(m: unknown): RecurrenceValidationResult | null {
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 12) {
      return { valid: false, error: 'month must be an integer from 1 to 12' };
    }
    return null;
  }

  private validateDay(d: unknown): RecurrenceValidationResult | null {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 31) {
      return { valid: false, error: 'day must be an integer from 1 to 31' };
    }
    return null;
  }
}