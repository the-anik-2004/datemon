import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { vi } from 'vitest';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject when SMTP delivery fails', async () => {
    vi.spyOn((service as any).transporter, 'sendMail').mockRejectedValue(
      new Error('Connection timeout'),
    );

    await expect(
      service.sendOtpEmail('user@example.com', '123456', 'Alice'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
