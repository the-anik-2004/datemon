import { RecurrenceType } from '@prisma/client';

export interface WeeklyRecurrenceData {
  dayOfWeek: number; // 0 (Sunday) – 6 (Saturday)
  time: string;      // "HH:mm" in user's local timezone
}

export interface MonthlyRecurrenceData {
  dayOfMonth: number; // 1–31
  time: string;
}

export interface YearlyRecurrenceData {
  month: number; // 1–12
  day: number;   // 1–31
  time: string;
}

export type RecurrenceData =
  | WeeklyRecurrenceData
  | MonthlyRecurrenceData
  | YearlyRecurrenceData
  | null;

export interface RecurrenceValidationResult {
  valid: boolean;
  error?: string;
}