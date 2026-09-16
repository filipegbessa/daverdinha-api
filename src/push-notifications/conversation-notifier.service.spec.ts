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

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    expect(pushNotifications.notifyNewMessage).toHaveBeenCalledWith({
      id: 'c1',
      name: 'Maria',
      phone: '5521999999999',
      messagePreview: 'Oi, tudo bem?',
    });
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
