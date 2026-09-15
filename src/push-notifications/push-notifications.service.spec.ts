import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushNotificationsService } from './push-notifications.service';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';

jest.mock('web-push');

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  let subscriptions: { listAll: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';

    subscriptions = { listAll: jest.fn().mockResolvedValue([]), remove: jest.fn() };
    (webpush.sendNotification as jest.Mock).mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PushNotificationsService,
        { provide: PushSubscriptionsService, useValue: subscriptions },
      ],
    }).compile();

    service = moduleRef.get(PushNotificationsService);
    service.onModuleInit();
  });

  it('configures VAPID details on module init', () => {
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'public-key',
      'private-key',
    );
  });

  it('sends a notification with the contact name as the title and the message as the body', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      { endpoint: 'https://push.example/2', p256dh: 'p2', auth: 'a2' },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue(undefined);

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: 'Oi, tudo bem?' });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
      JSON.stringify({ title: 'Maria', body: 'Oi, tudo bem?', url: '/admin/conversas/c1' }),
    );
  });

  it('falls back to the phone number as the title when the conversation has no name', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue(undefined);

    await service.notifyNewMessage({ id: 'c1', name: null, phone: '5521999999999', messagePreview: 'Oi!' });

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({ title: '5521999999999', body: 'Oi!', url: '/admin/conversas/c1' }),
    );
  });

  it('truncates a long message preview to keep the notification body short', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue(undefined);
    const longMessage = 'a'.repeat(200);

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: longMessage });

    const [, payload] = (webpush.sendNotification as jest.Mock).mock.calls[0];
    const { body } = JSON.parse(payload);
    expect(body).toBe(`${'a'.repeat(120)}…`);
  });

  it('removes a subscription the push service reports as gone (410)', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/dead', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: 'Oi, tudo bem?' });

    expect(subscriptions.remove).toHaveBeenCalledWith('https://push.example/dead');
  });

  it('does not remove a subscription on a transient error (e.g. 500)', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: 'Oi, tudo bem?' });

    expect(subscriptions.remove).not.toHaveBeenCalled();
  });

  it('logs a warning on a transient error (e.g. 500) instead of silently dropping it', async () => {
    subscriptions.listAll.mockResolvedValue([
      { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await service.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: 'Oi, tudo bem?' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://push.example/1'),
    );
    warnSpy.mockRestore();
  });

  describe('when VAPID is not configured', () => {
    async function buildServiceWithoutVapid() {
      const localSubscriptions = { listAll: jest.fn().mockResolvedValue([]), remove: jest.fn() };
      const moduleRef = await Test.createTestingModule({
        providers: [
          PushNotificationsService,
          { provide: PushSubscriptionsService, useValue: localSubscriptions },
        ],
      }).compile();

      const localService = moduleRef.get(PushNotificationsService);
      return { localService, localSubscriptions };
    }

    it('does not call setVapidDetails when a VAPID env var is missing', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      (webpush.setVapidDetails as jest.Mock).mockClear();

      try {
        const { localService } = await buildServiceWithoutVapid();
        localService.onModuleInit();

        expect(webpush.setVapidDetails).not.toHaveBeenCalled();
      } finally {
        process.env.VAPID_PUBLIC_KEY = 'public-key';
      }
    });

    it('does not send notifications or list subscriptions when VAPID is not configured', async () => {
      delete process.env.VAPID_PUBLIC_KEY;

      try {
        const { localService, localSubscriptions } = await buildServiceWithoutVapid();
        localService.onModuleInit();

        await localService.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: 'Oi!' });

        expect(localSubscriptions.listAll).not.toHaveBeenCalled();
        expect(webpush.sendNotification).not.toHaveBeenCalled();
      } finally {
        process.env.VAPID_PUBLIC_KEY = 'public-key';
      }
    });
  });

  describe('when VAPID keys are truthy but invalid (e.g. the .env.example placeholder)', () => {
    it('does not throw on onModuleInit and leaves notifications disabled', async () => {
      process.env.VAPID_PUBLIC_KEY = 'xxx';
      process.env.VAPID_PRIVATE_KEY = 'xxx';
      const setVapidDetailsMock = webpush.setVapidDetails as jest.Mock;
      setVapidDetailsMock.mockImplementation(() => {
        throw new Error('Vapid public key should be 65 bytes long when decoded.');
      });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      try {
        const localSubscriptions = { listAll: jest.fn().mockResolvedValue([]), remove: jest.fn() };
        const moduleRef = await Test.createTestingModule({
          providers: [
            PushNotificationsService,
            { provide: PushSubscriptionsService, useValue: localSubscriptions },
          ],
        }).compile();
        const localService = moduleRef.get(PushNotificationsService);

        expect(() => localService.onModuleInit()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();

        await localService.notifyNewMessage({ id: 'c1', name: 'Maria', phone: '5521999999999', messagePreview: 'Oi!' });

        expect(localSubscriptions.listAll).not.toHaveBeenCalled();
        expect(webpush.sendNotification).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
        setVapidDetailsMock.mockReset();
        process.env.VAPID_PUBLIC_KEY = 'public-key';
        process.env.VAPID_PRIVATE_KEY = 'private-key';
      }
    });
  });
});
