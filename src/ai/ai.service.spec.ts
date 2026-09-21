import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecurrenceValidator } from '../recurrence/recurrence.validator.js';
import { AiService } from './ai.service.js';

const { createMock, OpenAIMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  OpenAIMock: vi.fn(),
}));

vi.mock('openai', () => ({ default: OpenAIMock }));

describe('AiService', () => {
  let service: AiService;
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };
  let validator: { validate: ReturnType<typeof vi.fn> };

  const validParsed = {
    title: 'Call Mom',
    description: null,
    scheduledAt: '2099-01-01T19:00:00Z',
    priority: 'NORMAL',
    category: 'PERSONAL',
    recurrenceType: 'NONE',
    recurrenceData: null,
  };

  beforeEach(() => {
    createMock.mockReset();
    OpenAIMock.mockImplementation(function OpenAIConstructor() {
      return {
      chat: { completions: { create: createMock } },
      };
    });
    prisma = { user: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) } };
    validator = { validate: vi.fn().mockReturnValue({ valid: true }) };

    service = new AiService(
      {
        get: vi.fn((key: string) => ({
          OPENAI_API_KEY: 'test-key',
          OPENAI_MODEL: 'test-model',
          AI_TIMEOUT_MS: '15000',
        })[key]),
      } as unknown as ConfigService,
      prisma as unknown as PrismaService,
      validator as unknown as RecurrenceValidator,
    );
  });

  function mockEnvelope(envelope: unknown) {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(envelope) } }],
    });
  }

  it('parses a valid non-recurring reminder', async () => {
    mockEnvelope({
      parsed: validParsed,
      confidence: 0.95,
      needsClarification: null,
    });

    const result = await service.parseReminder('user-1', 'Call Mom tomorrow');

    expect(result.parsed?.title).toBe('Call Mom');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { timezone: true },
    });
  });

  it('returns clarification for ambiguous input', async () => {
    mockEnvelope({
      parsed: null,
      confidence: 0.2,
      needsClarification: { field: 'scheduledAt', question: 'When?' },
    });

    const result = await service.parseReminder('user-1', 'Remind me about it');

    expect(result.parsed).toBeNull();
    expect(result.needsClarification).not.toBeNull();
  });

  it('rejects invalid JSON from the AI', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }],
    });

    await expect(service.parseReminder('user-1', 'Call Mom tomorrow')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects an envelope with an extra field', async () => {
    mockEnvelope({
      parsed: validParsed,
      confidence: 0.95,
      needsClarification: null,
      foo: 'bar',
    });

    await expect(service.parseReminder('user-1', 'Call Mom tomorrow')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a past non-recurring date', async () => {
    mockEnvelope({
      parsed: { ...validParsed, scheduledAt: '2000-01-01T00:00:00Z' },
      confidence: 0.95,
      needsClarification: null,
    });

    await expect(service.parseReminder('user-1', 'Call Mom yesterday')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects an unknown priority enum', async () => {
    mockEnvelope({
      parsed: { ...validParsed, priority: 'SUPER_URGENT' },
      confidence: 0.95,
      needsClarification: null,
    });

    await expect(service.parseReminder('user-1', 'Call Mom tomorrow')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
