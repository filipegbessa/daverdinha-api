import { Test } from '@nestjs/testing';
import { ConversationNotifierService } from './conversation-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

describe('ConversationNotifierService', () => {
  let service: ConversationNotifierService;
  let prisma: { conversation: { findUnique: jest.Mock } };
  let pushNotifications: { notifyNewMessage: jest.Mock };

  beforeEach(async () => {
    prisma = { conversation: { findUnique: jest.fn() } };
    pushNotifications = { notifyNewMessage: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationNotifierService,
        { provide: PrismaService, useValue: prisma },
        { provide: PushNotificationsService, useValue: pushNotifications },
      ],
    }).compile();

    service = moduleRef.get(ConversationNotifierService);
  });

  it('notifies with the last message as the preview once the conversation is handed off', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'text', body: 'Oi, tudo bem?' }],
    });

    await service.notifyNewInboundMessage('c1');

    // Regression: this used to take the newest row of any direction, so a
    // flow that answered before the push went out (a catalog order ends on
    // the CEP prompt) previewed the bot's own text back to the operator.
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
      include: {
        messages: {
          where: { direction: 'inbound' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      messagePreview: 'Oi, tudo bem?',
    });
  });

  it('passes the message time along, so the push is not stamped with its own delivery', async () => {
    const createdAt = new Date('2026-09-17T14:32:00.000Z');
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'text', body: 'Oi, tudo bem?', createdAt }],
    });

    await service.notifyNewInboundMessage('c1');

    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sentAt: createdAt }),
    );
  });

  it('labels a photo, since an image with no caption has no body to show', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'image', body: null }],
    });

    await service.notifyNewInboundMessage('c1');

    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messagePreview: '📷 Foto' }),
    );
  });

  it('shows the caption alongside the photo marker when there is one', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'image', body: 'segue o comprovante' }],
    });

    await service.notifyNewInboundMessage('c1');

    // O marcador diz o que chegou; a legenda diz o que o cliente escreveu.
    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messagePreview: '📷 segue o comprovante' }),
    );
  });

  it('labels a catalog order instead of showing its empty body', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: null,
      phone: '5521999999999',
      status: 'paused_human',
      messages: [{ kind: 'order', body: null }],
    });

    await service.notifyNewInboundMessage('c1');

    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messagePreview: 'Novo pedido pelo catálogo' }),
    );
  });

  it('falls back to a generic preview when the conversation has no messages yet', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: null,
      phone: '5521999999999',
      status: 'paused_human',
      messages: [],
    });

    await service.notifyNewInboundMessage('c1');

    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messagePreview: 'Nova mensagem' }),
    );
  });

  it('stays quiet while the bot is still answering — nobody needs to pick up their phone', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      name: null,
      phone: '5521999999999',
      status: 'bot_active',
      messages: [{ kind: 'text', body: 'oi' }],
    });

    await service.notifyNewInboundMessage('c1');

    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });

  it('stays quiet when the conversation cannot be found', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);

    await service.notifyNewInboundMessage('gone');

    expect(pushNotifications.notifyNewMessage).not.toHaveBeenCalled();
  });
});
