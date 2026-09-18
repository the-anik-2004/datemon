import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OtpService } from '../otp/otp.service.js';
import { RegisterDto } from './dto/register.dto.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    refreshToken: { updateMany: ReturnType<typeof vi.fn> };
  };
  let otp: { verify: ReturnType<typeof vi.fn>; generateAndSend: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      refreshToken: {
        updateMany: vi.fn(),
      },
    };

    otp = {
      verify: vi.fn(),
      generateAndSend: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: OtpService, useValue: otp },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rejects weak passwords during registration', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'user@example.com',
      password: 'weak',
      name: 'User',
      timezone: 'UTC',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('locks the account temporarily after repeated failed login attempts', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('correct-password', 10),
      name: 'User',
      timezone: 'UTC',
      emailVerified: true,
    };

    prisma.user.findUnique.mockResolvedValue(user);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.login({
          email: 'user@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow('Invalid credentials');
    }

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'correct-password',
      }),
    ).rejects.toThrow('Too many failed login attempts');
  });

  it('changes the user password when the current one matches', async () => {
    const currentPassword = 'old-password';
    const newPassword = 'new-password-123';
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash(currentPassword, 10),
      name: 'User',
      timezone: 'UTC',
      emailVerified: true,
    };

    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockImplementation(async ({ data }) => ({
      ...user,
      passwordHash: data.passwordHash,
    }));
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.changePassword('user-1', {
      currentPassword,
      newPassword,
    });

    const savedHash = prisma.user.update.mock.calls.at(-1)?.[0]?.data?.passwordHash;
    expect(savedHash).toBeTruthy();
    expect(await bcrypt.compare(newPassword, savedHash)).toBe(true);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({ message: 'Password changed successfully' });
  });

  it('resets the password after a valid OTP code', async () => {
    const currentPassword = 'old-password';
    const newPassword = 'new-password-123';
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash(currentPassword, 10),
      name: 'User',
      timezone: 'UTC',
      emailVerified: true,
    };

    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockImplementation(async ({ data }) => ({
      ...user,
      passwordHash: data.passwordHash,
    }));
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    otp.verify.mockResolvedValue(true);

    const result = await service.resetPassword({
      email: 'USER@example.com',
      otp: '123456',
      newPassword,
    });

    const savedHash = prisma.user.update.mock.calls.at(-1)?.[0]?.data?.passwordHash;
    expect(savedHash).toBeTruthy();
    expect(await bcrypt.compare(newPassword, savedHash)).toBe(true);
    expect(otp.verify).toHaveBeenCalledWith('user-1', '123456');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({ message: 'Password reset successfully' });
  });
});
