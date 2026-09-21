import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Expo } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register or update a device. If the push token already exists (possibly
   * for a different user — e.g. device reused), we update the owner.
   */
  async register(userId: string, dto: RegisterDeviceDto) {
    if (!Expo.isExpoPushToken(dto.pushToken)) {
      throw new BadRequestException('Invalid Expo push token');
    }

    return this.prisma.device.upsert({
      where: { pushToken: dto.pushToken },
      update: {
        userId,          // re-assign to current user
        platform: dto.platform,
      },
      create: {
        userId,
        pushToken: dto.pushToken,
        platform: dto.platform,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.device.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) throw new NotFoundException('Device not found');
    return { success: true };
  }
}