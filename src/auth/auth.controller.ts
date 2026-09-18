import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/change.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorators.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ short: { ttl: 1000, limit: 3 }, long: { ttl: 60000, limit: 10 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-otp')
  @Throttle({ short: { ttl: 1000, limit: 5 }, long: { ttl: 60000, limit: 20 } })
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('resend-otp')
  @Throttle({ short: { ttl: 1000, limit: 3 }, long: { ttl: 60000, limit: 10 } })
  @HttpCode(200)
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Post('login')
  @Throttle({ short: { ttl: 1000, limit: 3 }, long: { ttl: 60000, limit: 15 } })
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Throttle({ short: { ttl: 1000, limit: 5 }, long: { ttl: 60000, limit: 30 } })
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Throttle({ short: { ttl: 1000, limit: 5 }, long: { ttl: 60000, limit: 30 } })
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('change-password')
  @Throttle({ short: { ttl: 1000, limit: 3 }, long: { ttl: 60000, limit: 10 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('forgot-password')
  @Throttle({ short: { ttl: 1000, limit: 3 }, long: { ttl: 60000, limit: 10 } })
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ short: { ttl: 1000, limit: 3 }, long: { ttl: 60000, limit: 10 } })
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}