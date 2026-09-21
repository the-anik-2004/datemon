import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: { notification: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() } },
        },
        { provide: PushService, useValue: { send: vi.fn() } },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
