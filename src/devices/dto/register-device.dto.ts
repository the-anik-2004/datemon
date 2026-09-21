import { IsEnum, IsString, MinLength } from 'class-validator';
import { Platform } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  pushToken: string;

  @IsEnum(Platform)
  platform: Platform;
}