import { IsEnum, IsOptional, IsISO8601 } from 'class-validator';

export enum SnoozePreset {
  TEN_MINUTES = 'TEN_MINUTES',
  ONE_HOUR = 'ONE_HOUR',
  TOMORROW = 'TOMORROW',
  CUSTOM = 'CUSTOM',
}

export class SnoozeReminderDto {
  @IsEnum(SnoozePreset)
  preset: SnoozePreset;

  @IsOptional()
  @IsISO8601()
  customUntil?: string;
}