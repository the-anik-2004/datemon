import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  MaxLength,
  IsObject,
  ValidateIf,
} from 'class-validator';
import { Priority, Category, RecurrenceType } from '@prisma/client';

export class CreateReminderDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsISO8601()
  scheduledAt: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsEnum(RecurrenceType)
  recurrenceType?: RecurrenceType;

  @ValidateIf((o) => o.recurrenceType && o.recurrenceType !== 'NONE')
  @IsObject()
  recurrenceData?: Record<string, unknown>;
}