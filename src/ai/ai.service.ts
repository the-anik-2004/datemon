import {
  BadGatewayException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecurrenceType } from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecurrenceValidator } from '../recurrence/recurrence.validator.js';
import { buildParseReminderPrompt } from './prompts/parse-reminder.prompt.js';
import {
  AIEnvelope,
  AIEnvelopeSchema,
  ParsedReminder,
} from './schema/parsed-reminder.schema.js';

export interface ParseReminderResult {
  parsed: ParsedReminder | null;
  confidence: number;
  needsClarification: AIEnvelope['needsClarification'];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly provider: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly recurrenceValidator: RecurrenceValidator,
  ) {
    this.provider = (this.config.get<string>('AI_PROVIDER') ?? 'openai').toLowerCase();
    const providerConfig = {
      groq: {
        apiKey: this.config.get<string>('GROQ_API_KEY'),
        model: this.config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-20b',
        baseURL: 'https://api.groq.com/openai/v1',
      },
      openrouter: {
        apiKey: this.config.get<string>('OPENROUTER_API_KEY'),
        model: this.config.get<string>('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini',
        baseURL: 'https://openrouter.ai/api/v1',
      },
      openai: {
        apiKey: this.config.get<string>('OPENAI_API_KEY'),
        model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        baseURL: undefined,
      },
    }[this.provider] ?? {
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      baseURL: undefined,
    };

    this.openai = new OpenAI({
      apiKey: providerConfig.apiKey,
      timeout: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 15000),
      baseURL: providerConfig.baseURL,
    });
    this.model = providerConfig.model;
  }

  async parseReminder(userId: string, text: string): Promise<ParseReminderResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    if (!user) {
      throw new UnprocessableEntityException('Unable to determine your timezone.');
    }

    const prompt = buildParseReminderPrompt({
      nowIso: new Date().toISOString(),
      timezone: user.timezone,
      userText: text,
    });

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      });
    } catch (error) {
      this.logger.error(
        `${this.provider} request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadGatewayException(
        'AI service is temporarily unavailable. Please try again.',
      );
    }

    const raw = response.choices[0]?.message?.content ?? '';
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      this.logger.warn(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
      throw new UnprocessableEntityException(
        "Sorry, I couldn't understand that reminder. Please try again.",
      );
    }

    const envelope = AIEnvelopeSchema.safeParse(decoded);
    if (!envelope.success) {
      this.logger.warn(`AI response failed schema validation: ${JSON.stringify(envelope.error.issues)}`);
      throw new UnprocessableEntityException(
        "Sorry, I couldn't understand that reminder. Please try again.",
      );
    }

    if (envelope.data.parsed === null) {
      return {
        parsed: null,
        confidence: envelope.data.confidence,
        needsClarification: envelope.data.needsClarification,
      };
    }

    this.validateBusinessRules(envelope.data.parsed);
    return {
      parsed: envelope.data.parsed,
      confidence: envelope.data.confidence,
      needsClarification: null,
    };
  }

  private validateBusinessRules(parsed: ParsedReminder): void {
    const scheduledAt = new Date(parsed.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new UnprocessableEntityException('The reminder date is invalid.');
    }

    if (parsed.recurrenceType === 'NONE' && scheduledAt <= new Date()) {
      throw new UnprocessableEntityException(
        'Non-recurring reminders must be scheduled in the future.',
      );
    }

    if (parsed.recurrenceType !== 'NONE') {
      const result = this.recurrenceValidator.validate(
        parsed.recurrenceType as RecurrenceType,
        parsed.recurrenceData,
      );
      if (!result.valid) {
        throw new UnprocessableEntityException(result.error);
      }
    }

    if (!/[a-zA-Z]/.test(parsed.title)) {
      throw new UnprocessableEntityException(
        'The reminder title must contain at least one letter.',
      );
    }
  }
}
