import { Test } from '@nestjs/testing';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PushSubscriptionsService', () => {
  let service: PushSubscriptionsService;
  let prisma: { pushSubscription: any };

  beforeEach(async () => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PushSubscriptionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PushSubscriptionsService);
  });

  it('save() upserts by endpoint, tying the subscription to the given Clerk user', async () => {
    await service.save('user_abc123', {
      endpoint: 'https://fcm.googleapis.com/send/xyz',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.googleapis.com/send/xyz' },
      update: { clerkUserId: 'user_abc123', p256dh: 'p256dh-value', auth: 'auth-value' },
      create: {
        clerkUserId: 'user_abc123',
        endpoint: 'https://fcm.googleapis.com/send/xyz',
        p256dh: 'p256dh-value',
        auth: 'auth-value',
      },
    });
  });

  it('remove() deletes by endpoint', async () => {
    await service.remove('https://fcm.googleapis.com/send/xyz');

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.googleapis.com/send/xyz' },
    });
  });

  it('listAll() returns every stored subscription', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([{ id: 's1' }]);

    const result = await service.listAll();

    expect(result).toEqual([{ id: 's1' }]);
  });
});
