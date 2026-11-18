import { AlertsService, ALERT_INTERVAL_MS } from './alerts.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushNotificationsService } from '../push-notifications/push-notifications.service';
import type { EmailService } from '../email/email.service';

describe('AlertsService', () => {
  const prisma = { lookupAttempt: { count: jest.fn(), create: jest.fn() } };
  const push = { notifyAlert: jest.fn() };
  const email = { configured: true, send: jest.fn() };
  const service = new AlertsService(
    prisma as unknown as PrismaService,
    push as unknown as PushNotificationsService,
    email as unknown as EmailService,
  );
  const now = new Date('2026-11-18T12:00:00Z');
  const alert = {
    kind: 'payment_link' as const,
    title: 'Uma compra não conseguiu ir pro pagamento',
    detail: 'DV-0042: down',
    url: '/admin/pedidos/o1',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    push.notifyAlert.mockResolvedValue(undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
    delete process.env.ALERT_EMAIL;
  });

  it('pushes to the admin, marks the alert and emails ALERT_EMAIL when set', async () => {
    process.env.ALERT_EMAIL = 'alertas@exemplo.com';
    prisma.lookupAttempt.count.mockResolvedValue(0);

    await service.alert(alert, now);

    expect(prisma.lookupAttempt.count).toHaveBeenCalledWith({
      where: {
        key: 'alert:payment_link',
        createdAt: { gt: new Date(now.getTime() - ALERT_INTERVAL_MS) },
      },
    });
    expect(prisma.lookupAttempt.create).toHaveBeenCalledWith({
      data: { key: 'alert:payment_link' },
    });
    expect(push.notifyAlert).toHaveBeenCalledWith({
      title: '⚠️ Uma compra não conseguiu ir pro pagamento',
      body: 'DV-0042: down',
      url: '/admin/pedidos/o1',
    });
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alertas@exemplo.com',
        subject: '[Daverdinha] Uma compra não conseguiu ir pro pagamento',
      }),
    );
  });

  it('stays quiet when the same kind was sent in the last 30 minutes', async () => {
    prisma.lookupAttempt.count.mockResolvedValue(1);

    await service.alert(alert, now);

    expect(push.notifyAlert).not.toHaveBeenCalled();
    expect(service['logger'].error).toHaveBeenCalled();
  });

  it('skips the email without ALERT_EMAIL, and never throws', async () => {
    prisma.lookupAttempt.count.mockRejectedValue(new Error('db down'));

    await expect(service.alert(alert, now)).resolves.toBeUndefined();
    expect(email.send).not.toHaveBeenCalled();
  });
});
