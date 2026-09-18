import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { OtpService } from './otp.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}