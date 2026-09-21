import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { RemindersService } from './reminders.service.js';
import { CreateReminderDto } from './dto/create-reminders.dto.js';
import { UpdateReminderDto } from './dto/update-reminders.dto.js';
import { QueryRemindersDto } from './dto/query-reminders.dto.js';
import { SnoozeReminderDto } from './dto/snooze-reminders.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorators.js';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReminderDto,
  ) {
    return this.remindersService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query() query: QueryRemindersDto,
  ) {
    return this.remindersService.findAll(user.id, query);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: { id: string }) {
    return this.remindersService.dashboard(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.remindersService.findOne(user.id, id);
  }

  @Get(':id/next-occurrence')
  async nextOccurrence(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.remindersService.previewNextOccurrence(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.remindersService.remove(user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.remindersService.complete(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.remindersService.cancel(user.id, id);
  }

  @Post(':id/snooze')
  @HttpCode(200)
  snooze(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SnoozeReminderDto,
  ) {
    return this.remindersService.snooze(user.id, id, dto);
  }
}