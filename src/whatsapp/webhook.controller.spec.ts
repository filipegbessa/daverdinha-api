import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import * as verifySignatureModule from './verify-signature';

describe('WebhookController', () => {
  let controller: WebhookController;
  let botEngine: { handleIncomingMessage: jest.Mock };
  let prisma: { conversation: { findFirst: jest.Mock } };
  let pushNotifications: { notifyNewMessage: jest.Mock };

  const payload = {
    entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'text', text: { body: 'oi' } }] } }] }],
  };

  function fakeRequest() {
    return {
      rawBody: Buffer.from(JSON.stringify(payload)),
      headers: { 'x-hub-signature-256': 'sha256=whatever' },
    } as any;
  }

  beforeEach(async () => {
    process.env.WHATSAPP_APP_SECRET = 'test-secret';
    jest.spyOn(verifySignatureModule, 'verifySignature').mockReturnValue(true);

    botEngine = { handleIncomingMessage: jest.fn().mockResolvedValue(true) };
    prisma = { conversation: { findFirst: jest.fn() } };
    pushNotifications = { notifyNewMessage: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: BotEngineService, useValue: botEngine },
        { provide: PrismaService, useValue: prisma },
        { provide: PushNotificationsService, useValue: pushNotifications },
      ],
    }).compile();

    controller = moduleRef.get(WebhookController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifies with the last inbound message as the preview when the conversation ends up paused_human', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'text', body: 'Oi, tudo bem?' }],
    });

    await controller.receive(fakeRequest(), payload);

    expect(botEngine.handleIncomingMessage).toHaveBeenCalledWith(payload);
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { phone: '5521999999999' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      messagePreview: 'Oi, tudo bem?',
    });
  });

  it('uses a catalog-order label as the preview when the last message is an order', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'order', body: null }],
    });

    await controller.receive(fakeRequest(), payload);

    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      messagePreview: 'Novo pedido pelo catálogo',
    });
  });

  it('falls back to a generic preview when there is no last message', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [],
    });

    await controller.receive(fakeRequest(), payload);

    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      messagePreview: 'Nova mensagem',
    });
  });

  it('does not notify when the conversation is still bot_active', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'bot_active',
      messages: [{ kind: 'text', body: 'oi' }],
    });

    await controller.receive(fakeRequest(), payload);

    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });

  it('skips the notification lookup entirely when the message was a duplicate webhook delivery', async () => {
    botEngine.handleIncomingMessage.mockResolvedValue(false);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'text', body: 'oi' }],
    });

    const result = await controller.receive(fakeRequest(), payload);

    expect(result).toEqual({ status: 'ok' });
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });

  it('does not notify when the payload has no extractable phone (e.g. a status webhook)', async () => {
    const statusPayload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1' }] } }] }] };

    await controller.receive(fakeRequest(), statusPayload);

    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });

  it('still returns ok when the notification lookup throws (never fails the webhook response)', async () => {
    prisma.conversation.findFirst.mockRejectedValue(new Error('db unavailable'));

    await expect(controller.receive(fakeRequest(), payload)).resolves.toEqual({ status: 'ok' });
    expect(botEngine.handleIncomingMessage).toHaveBeenCalledWith(payload);
  });

  it('still returns ok when notifyNewMessage throws (never fails the webhook response)', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'text', body: 'oi' }],
    });
    pushNotifications.notifyNewMessage.mockRejectedValue(new Error('push failed'));

    await expect(controller.receive(fakeRequest(), payload)).resolves.toEqual({ status: 'ok' });
  });

  it('logs a warning and still returns ok when the notification path throws', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'text', body: 'oi' }],
    });
    pushNotifications.notifyNewMessage.mockRejectedValue(new Error('push failed'));
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(controller.receive(fakeRequest(), payload)).resolves.toEqual({ status: 'ok' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process post-webhook notification'),
    );
    warnSpy.mockRestore();
  });
});
