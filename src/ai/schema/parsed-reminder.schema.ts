import { z } from 'zod';

export const PriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const CategoryEnum = z.enum([
  'PERSONAL',
  'BILL',
  'APPOINTMENT',
  'WORK',
  'STUDY',
  'HEALTH',
  'RENEWAL',
  'BIRTHDAY',
  'OTHER',
]);

export const RecurrenceTypeEnum = z.enum([
  'NONE',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
]);

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const RecurrenceDataSchema = z
  .union([
    z.object({ time: TimeSchema }).passthrough(),
    z.object({ dayOfWeek: z.number().int().min(0).max(6), time: TimeSchema }).passthrough(),
    z.object({ dayOfMonth: z.number().int().min(1).max(31), time: TimeSchema }).passthrough(),
    z.object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31), time: TimeSchema }).passthrough(),
  ])
  .nullable()
  .optional()
  .default(null);

export const ParsedReminderSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional().default(null),
    scheduledAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
    priority: PriorityEnum.default('NORMAL'),
    category: CategoryEnum.default('OTHER'),
    recurrenceType: RecurrenceTypeEnum.default('NONE'),
    recurrenceData: RecurrenceDataSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const data = value.recurrenceData;
    const invalid =
      (value.recurrenceType === 'NONE' && data !== null) ||
      (value.recurrenceType === 'DAILY' &&
        (!data || !('time' in data) || 'dayOfWeek' in data || 'dayOfMonth' in data || 'month' in data)) ||
      (value.recurrenceType === 'WEEKLY' &&
        (!data || !('dayOfWeek' in data) || 'dayOfMonth' in data || 'month' in data)) ||
      (value.recurrenceType === 'MONTHLY' &&
        (!data || !('dayOfMonth' in data) || 'dayOfWeek' in data || 'month' in data)) ||
      (value.recurrenceType === 'YEARLY' &&
        (!data || !('month' in data) || !('day' in data)));

    if (invalid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrenceData'],
        message: 'recurrenceData does not match recurrenceType',
      });
    }
  });

const ClarificationSchema = z
  .object({
    field: z.enum(['title', 'scheduledAt', 'time', 'date', 'recurrence']),
    question: z.string().min(1).max(300),
  })
  .strict();

export const AIEnvelopeSchema = z
  .object({
    parsed: ParsedReminderSchema.nullable(),
    confidence: z.number().min(0).max(1),
    needsClarification: ClarificationSchema.nullable(),
  })
  .strict();

export type ParsedReminder = z.infer<typeof ParsedReminderSchema>;
export type AIEnvelope = z.infer<typeof AIEnvelopeSchema>;
