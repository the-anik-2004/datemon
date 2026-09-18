import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate a 6-digit OTP, hash it, store it, and email it.
   * Enforces a resend cooldown.
   */
  async generateAndSend(userId: string, email: string, name: string) {
    const cooldownSec = Number(
      this.config.get<string>('OTP_RESEND_COOLDOWN_SECONDS') ?? 60,
    );

    // 1. Enforce resend cooldown
    const recent = await this.prisma.emailOtp.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const ageSec = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (ageSec < cooldownSec) {
        throw new BadRequestException(
          `Please wait ${Math.ceil(cooldownSec - ageSec)}s before requesting a new code`,
        );
      }
    }

    // 2. Generate OTP (000000–999999)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Hash it
    const otpHash = await bcrypt.hash(otp, this.SALT_ROUNDS);

    // 4. Compute expiry
    const minutes = Number(
      this.config.get<string>('OTP_EXPIRES_MINUTES') ?? 10,
    );
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    // 5. Invalidate any previous unconsumed OTPs for this user
    await this.prisma.emailOtp.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    // 6. Store new OTP
    await this.prisma.emailOtp.create({
      data: { userId, otpHash, expiresAt },
    });

    // 7. Send the email
    await this.mail.sendOtpEmail(email, otp, name);

    this.logger.log(`OTP generated for user ${userId}`);

    return { message: 'Verification code sent', email };
  }

  /**
   * Verify an OTP against the latest unconsumed one for this user.
   * On success, marks it consumed.
   */
  async verify(userId: string, otp: string) {
    const maxAttempts = Number(
      this.config.get<string>('OTP_MAX_ATTEMPTS') ?? 5,
    );

    const record = await this.prisma.emailOtp.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new NotFoundException('No pending verification code. Request a new one.');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Verification code has expired. Request a new one.');
    }

    if (record.attempts >= maxAttempts) {
      throw new BadRequestException('Too many attempts. Request a new code.');
    }

    const valid = await bcrypt.compare(otp, record.otpHash);
    if (!valid) {
      await this.prisma.emailOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.emailOtp.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    return true;
  }

  /**
   * Resend OTP: look up user by email, then call generateAndSend.
   * Used by POST /auth/resend-otp.
   */
  async resendByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Don't leak whether the email exists — return generic message either way.
    if (!user) {
      return { message: 'If this email exists, a code has been sent' };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    return this.generateAndSend(user.id, user.email, user.name);
  }
}