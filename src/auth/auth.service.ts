import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {ConfigService} from '@nestjs/config';
import {JwtService} from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { OtpService } from '../otp/otp.service.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/change.dto.js';

@Injectable()
export class AuthService {
    private readonly SALT_ROUNDS = Number(process.env.SALT_ROUNDS ?? 10);
    private readonly MAX_LOGIN_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
    private readonly LOGIN_LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15);
    private readonly failedLogins = new Map<string, { count: number; lastFailedAt: number; lockedUntil?: number }>();

    constructor(
        private readonly prisma : PrismaService,
        private readonly jwt : JwtService,
        private readonly config : ConfigService,
        private readonly otp: OtpService,
    ){}

    //----------register-user-----------
    async register(dto: RegisterDto){

        const existing =await this.prisma.user.findUnique({
            where:{email:dto.email.toLocaleLowerCase()}
        });

        // Case 1: user exists AND is verified → conflict
        if(existing?.emailVerified){
            throw new ConflictException('Email already registered');
        }

        //case 2:user exists but is NOT verified → resend OTP (allow retry)
        if (existing && !existing.emailVerified){
            return this.otp.generateAndSend(existing.id, existing.email, existing.name);
        }

        // case:3 brand new user
        const passwordHash = await bcrypt.hash(dto.password,this.SALT_ROUNDS)
        const user = await this.prisma.user.create({
            data:{
                email:dto.email,
                passwordHash,
                name: dto.name,
                timezone: dto.timezone ?? 'UTC',
                emailVerified: false,
            }
        });
         return this.otp.generateAndSend(user.id, user.email, user.name);
    }


    async verifyOtp(dto: VerifyOtpDto) {
        const email = dto.email.toLowerCase();
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
        throw new BadRequestException('Invalid verification attempt');
        }

        if (user.emailVerified) {
        // Already verified — idempotent behaviour: just issue tokens
        const tokens = await this.issueTokens(user.id, user.email);
        return { user: this.sanitizeUser(user), ...tokens };
        }

        await this.otp.verify(user.id, dto.otp);

        await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
        });

        const refreshed = await this.prisma.user.findUnique({ where: { id: user.id } });
        const tokens = await this.issueTokens(user.id, user.email);
        return { user: this.sanitizeUser(refreshed!), ...tokens };
    }

    async resendOtp(email: string) {
        return this.otp.resendByEmail(email);
    }
    // //----------login-user-----------
    async login(dto:LoginDto){
        const email = dto.email.toLowerCase();
        const failedAttempt = this.failedLogins.get(email);

        if (failedAttempt && failedAttempt.lockedUntil && failedAttempt.lockedUntil > Date.now()) {
            const remainingMs = failedAttempt.lockedUntil - Date.now();
            const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
            throw new UnauthorizedException(`Too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`);
        }

        const user = await this.prisma.user.findUnique({
            where:{email}
        });

        if (!user) {
            this.recordFailedLogin(email);
            throw new UnauthorizedException('Invalid credentials');
        }

        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) {
            this.recordFailedLogin(email);
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.emailVerified) {
            this.clearFailedLogins(email);
            throw new UnauthorizedException('Email not verified. Please verify your email.');
        }

        this.clearFailedLogins(email);
        const tokens = await this.issueTokens(user.id, user.email);
        return { user: this.sanitizeUser(user), ...tokens };
  }
    

    // -------Refresh Token-------
    async refresh(refreshToken:string){
        //1. Verify the JWT signature
        let payload: {sub:string,email:string}

        try{
            payload= await this.jwt.verifyAsync(
                refreshToken,
                {
                    secret: this.config.get<string>('JWT_REFRESH_SECRET')
                }
            );
        }catch{
            throw new UnauthorizedException('Invalid refresh token');
        }

        //2. Find matching stored token
        const allTokens = await this.prisma.refreshToken.findMany({
            where:{userId:payload.sub,revokedAt:null}
        });

        let matched : {id :string} | null=null;
        for (const t of allTokens){
            if(await bcrypt.compare(refreshToken,t.tokenHash)){
                matched=t;
                break;
            }
        }

        if (!matched){
             throw new UnauthorizedException('Refresh token revoked or unknown');
        }

        
        //3. Rotate: revoke old issue new
        await this.prisma.refreshToken.update({
            where:{id:matched.id},
            data:{
                revokedAt: new Date()
            },
        });

        return this.issueTokens(payload.sub,payload.email)
    }


    //Logut
    async logout(refreshToken:string){
        const allTokens=await this.prisma.refreshToken.findMany({
            where :{revokedAt:null}
        });

        for(const t of allTokens){
            if(await bcrypt.compare(refreshToken,t.tokenHash)){
            await this.prisma.refreshToken.update({
                where: { id: t.id },
                data: { revokedAt: new Date() },
                });
                break;
            }
        }
        return {success:true}
    }


    //issue token
    private async issueTokens(userId: string, email:string){
        const accessToken =await this.jwt.signAsync(
            {sub:userId,email},
            {
                secret: this.config.get<string>('JWT_SECRET'),
                expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m') as SignOptions['expiresIn'],
            },
        );

        const refreshToken= await this.jwt.signAsync(
            { sub: userId, email },
            {
                secret: this.config.get<string>('JWT_REFRESH_SECRET'),
                expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as SignOptions['expiresIn'],
            },
        )

        const tokenHash = await bcrypt.hash(refreshToken, this.SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await this.prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt },
        });

        return { accessToken, refreshToken };
    }

    private recordFailedLogin(email: string) {
      const existing = this.failedLogins.get(email) ?? { count: 0, lastFailedAt: Date.now() };
      const count = existing.count + 1;
      const lockedUntil = count >= this.MAX_LOGIN_ATTEMPTS
        ? Date.now() + this.LOGIN_LOCKOUT_MINUTES * 60 * 1000
        : undefined;

      this.failedLogins.set(email, {
        count,
        lastFailedAt: Date.now(),
        lockedUntil,
      });
    }

    private clearFailedLogins(email: string) {
      this.failedLogins.delete(email);
    }

    //sanitizeUser
    private sanitizeUser<T extends {passwordHash:string}>(user:T){
        const {passwordHash,...safe}=user;
        return safe;
    }

    async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safe } = user;
    return safe;
  }

    async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
    });
    const { passwordHash, ...safe } = user;
    return safe;
    }

    async changePassword(userId: string, dto: ChangePasswordDto) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });

      return { message: 'Password changed successfully' };
    }

    async forgotPassword(dto: ForgotPasswordDto) {
      const email = dto.email.toLowerCase();
      const user = await this.prisma.user.findUnique({ where: { email } });

      if (!user) {
        return { message: `Datemon does not know your ${email}.` };
      }

      await this.otp.generateAndSend(user.id, user.email, user.name);
      return { message: `Datemon has send otp to your mail. | ${email}` };
    }

    async resetPassword(dto: ResetPasswordDto) {
      const email = dto.email.toLowerCase();
      const user = await this.prisma.user.findUnique({ where: { email } });

      if (!user) {
        throw new BadRequestException('Invalid reset attempt');
      }

      await this.otp.verify(user.id, dto.otp);

      const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      });

      return { message: 'Password reset successfully' };
    }
}
