import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemindersService } from './reminders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('RemindersService', () => {
  let service: RemindersService;
  let prisma: {
    reminder: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      reminder: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rejects completing a cancelled reminder', async () => {
    prisma.reminder.findFirst.mockResolvedValue({
      id: 'rem-1',
      userId: 'user-1',
      status: 'CANCELLED',
      recurrenceType: 'NONE',
      scheduledAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    await expect(service.complete('user-1', 'rem-1')).rejects.toThrow(
      'Cannot complete a cancelled reminder',
    );
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled();
  });

  it('uses the existing reminder recurrenceType when validating a partial scheduledAt update', async () => {
    prisma.reminder.findFirst.mockResolvedValue({
      id: 'rem-1',
      userId: 'user-1',
      recurrenceType: 'DAILY',
      status: 'ACTIVE',
      scheduledAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    await expect(
      service.update('user-1', 'rem-1', {
        scheduledAt: '2000-01-01T00:00:00.000Z',
      }),
    ).resolves.toBeTruthy();

    expect(prisma.reminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rem-1', userId: 'user-1' },
      }),
    );
  });

  it('uses the authenticated user in completion mutation predicates', async () => {
    const reminder = {
      id: 'rem-1',
      userId: 'user-1',
      status: 'ACTIVE',
      recurrenceType: 'NONE',
      scheduledAt: new Date('2099-01-01T00:00:00.000Z'),
    };
    prisma.reminder.findFirst.mockResolvedValue(reminder);

    await service.complete('user-1', 'rem-1');

    expect(prisma.reminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rem-1', userId: 'user-1' },
      }),
    );
  });

  it('clamps pagination in the service', async () => {
    await service.findAll('user-1', { take: 1000, skip: -5 });

    expect(prisma.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, skip: 0 }),
    );
  });
});
