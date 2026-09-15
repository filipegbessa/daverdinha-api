import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';

@Injectable()
export class PushSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  save(clerkUserId: string, dto: SavePushSubscriptionDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { clerkUserId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: {
        clerkUserId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async remove(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  listAll() {
    return this.prisma.pushSubscription.findMany();
  }
}
