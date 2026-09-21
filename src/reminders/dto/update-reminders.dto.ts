import { PartialType } from '@nestjs/mapped-types';
import { CreateReminderDto } from './create-reminders.dto.js';

export class UpdateReminderDto extends PartialType(CreateReminderDto) {}