import { Test } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { ConversationNotifierService } from '../push-notifications/conversation-notifier.service';
import * as verifySignatureModule from './verify-signature';

describe('WebhookController', () => {
  let controller: WebhookController;
  let botEngine: { handleIncomingMessage: jest.Mock };
  let notifier: { notifyNewInboundMessage: jest.Mock };

  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: '5521999999999', type: 'text', text: { body: 'oi' } },
              ],
            },
          },
        ],
      },
    ],
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

    botEngine = {
      handleIncomingMessage: jest
        .fn()
        .mockResolvedValue({ conversationId: 'c1' }),
    };
    notifier = { notifyNewInboundMessage: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: BotEngineService, useValue: botEngine },
        { provide: ConversationNotifierService, useValue: notifier },
      ],
    }).compile();

    controller = moduleRef.get(WebhookController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET (Meta subscription handshake)', () => {
    it('echoes the challenge back when the verify token matches', () => {
      process.env.WHATSAPP_VERIFY_TOKEN = 'tok';
      expect(controller.verify('subscribe', 'tok', 'chal')).toBe('chal');
    });

    it('rejects a mismatched verify token', () => {
      process.env.WHATSAPP_VERIFY_TOKEN = 'tok';
      expect(() => controller.verify('subscribe', 'wrong', 'chal')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST', () => {
    it('rejects a payload whose signature does not check out, without touching the bot', async () => {
      jest
        .spyOn(verifySignatureModule, 'verifySignature')
        .mockReturnValue(false);

      await expect(controller.receive(fakeRequest(), payload)).rejects.toThrow(
        ForbiddenException,
      );
      expect(botEngine.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('hands the payload to the bot and notifies about the conversation it touched', async () => {
      const result = await controller.receive(fakeRequest(), payload);

      expect(botEngine.handleIncomingMessage).toHaveBeenCalledWith(payload);
      expect(notifier.notifyNewInboundMessage).toHaveBeenCalledWith('c1');
      expect(result).toEqual({ status: 'ok' });
    });

    it('skips the notification entirely when the bot processed nothing (duplicate or non-message webhook)', async () => {
      botEngine.handleIncomingMessage.mockResolvedValue(null);

      const result = await controller.receive(fakeRequest(), payload);

      expect(notifier.notifyNewInboundMessage).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'ok' });
    });

    it('still acks with 200 when notifying throws — Meta retries anything we do not ack, which would replay the message', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      notifier.notifyNewInboundMessage.mockRejectedValue(
        new Error('push exploded'),
      );

      const result = await controller.receive(fakeRequest(), payload);

      expect(result).toEqual({ status: 'ok' });
      expect(warn).toHaveBeenCalled();
    });
  });
});
