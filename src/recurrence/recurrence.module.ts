import { Module } from '@nestjs/common';
import { RecurrenceValidator } from './recurrence.validator.js';
import { RecurrenceCalculator } from './recurrence.calculator.js';

@Module({
  providers: [RecurrenceValidator, RecurrenceCalculator],
  exports: [RecurrenceValidator, RecurrenceCalculator],
})
export class RecurrenceModule {}