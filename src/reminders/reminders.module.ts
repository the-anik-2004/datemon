import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service.js';
import { RemindersController } from './reminders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports:[PrismaModule],
  providers: [RemindersService],
  controllers: [RemindersController],
  exports:[RemindersService],
})
export class RemindersModule {}
