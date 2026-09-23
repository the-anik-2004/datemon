import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const provider = (this.config.get<string>('MAIL_PROVIDER') ?? 'gmail').toLowerCase();
    const host = this.config.get<string>('MAIL_HOST') ?? this.getDefaultHost(provider);
    const port = Number(this.config.get<string>('MAIL_PORT') ?? this.getDefaultPort(provider));
    const secure = this.config.get<string>('MAIL_SECURE') === 'true' || port === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: this.config.get<string>('MAIL_REQUIRE_TLS') === 'true',
      ignoreTLS: this.config.get<string>('MAIL_IGNORE_TLS') === 'true',
      pool: this.config.get<string>('MAIL_POOL') === 'true',
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  private getDefaultHost(provider: string) {
    if (provider === 'resend') return 'smtp.resend.com';
    if (provider === 'sendgrid') return 'smtp.sendgrid.net';
    if (provider === 'mailgun') return 'smtp.mailgun.org';
    return 'smtp.gmail.com';
  }

  private getDefaultPort(provider: string) {
    if (provider === 'resend' || provider === 'sendgrid' || provider === 'mailgun') return 587;
    return 587;
  }

  async sendOtpEmail(to: string, otp: string, name: string) {
    const mailDisabled = this.config.get<string>('MAIL_DISABLED') === 'true';
    const failOnError = this.config.get<string>('MAIL_FAIL_ON_ERROR') === 'true';

    if (mailDisabled) {
      this.logger.warn(
        'Email delivery is disabled via MAIL_DISABLED; skipping OTP email send.',
      );
      return;
    }

    const from = this.config.get<string>('MAIL_FROM') ?? 'DATEMON <noreply@datemon.app>';
    const replyTo = this.config.get<string>('MAIL_REPLY_TO') ?? from;
    const minutes = this.config.get<string>('OTP_EXPIRES_MINUTES') ?? '5';

    try {
      const info = await this.transporter.sendMail({
        from,
        replyTo,
        to,
        subject: 'Your DATEMON verification code',
        text: `Hi ${name},\n\nYour DATEMON verification code is: ${otp}\n\nIt expires in ${minutes} minutes.\n\nIf you didn't request this, ignore this email.`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: auto;">
            <h2>Verify your DATEMON account</h2>
            <p>Hi ${name},</p>
            <p>Your verification code is:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; background: #f4f4f4; padding: 16px; text-align: center; border-radius: 8px;">
              ${otp}
            </p>
            <p>This code expires in <strong>${minutes} minutes</strong>.</p>
            <p style="color: #888; font-size: 12px;">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        this.logger.log(`📧 OTP email preview: ${previewUrl}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send OTP email to ${to}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (failOnError) {
        throw error;
      }

      this.logger.warn(
        'Continuing because MAIL_FAIL_ON_ERROR is disabled. Configure a production mail provider or set MAIL_DISABLED=false.',
      );
    }
  }
}

