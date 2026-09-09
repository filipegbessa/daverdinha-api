import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: { conversation: any; message: any; $transaction: jest.Mock };
  let whatsapp: { sendText: jest.Mock };

  beforeEach(async () => {
    prisma = {
      conversation: { findMany: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      message: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    whatsapp = { sendText: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
      ],
    }).compile();
    service = moduleRef.get(ConversationsService);
  });

  it('list() returns conversations ordered by updatedAt desc, each annotated with unread', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      { id: '1', phone: '5521999999999', messages: [{ direction: 'inbound' }] },
      { id: '2', phone: '5521988888888', messages: [{ direction: 'outbound' }] },
      { id: '3', phone: '5521977777777', messages: [] },
    ]);

    const result = await service.list();

    expect(prisma.conversation.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    expect(result).toEqual([
      { id: '1', phone: '5521999999999', unread: true },
      { id: '2', phone: '5521988888888', unread: false },
      { id: '3', phone: '5521977777777', unread: false },
    ]);
  });

  it('getWithMessages() returns the conversation with its messages ordered chronologically', async () => {
    const conversation = { id: '1', messages: [] };
    prisma.conversation.findUnique.mockResolvedValue(conversation);
    const result = await service.getWithMessages('1');
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    expect(result).toBe(conversation);
  });

  it('getWithMessages() throws NotFoundException when the conversation does not exist', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(service.getWithMessages('missing')).rejects.toThrow(NotFoundException);
  });

  describe('reply()', () => {
    it('sends the text via WhatsApp, persists an outbound message, and bumps the conversation timestamp when paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        phone: '5521999999999',
        status: 'paused_human',
      });
      const created = { id: 'm1', conversationId: 'c1', direction: 'outbound', body: 'Oi!' };
      prisma.message.create.mockReturnValue(created);
      prisma.conversation.update.mockReturnValue({ id: 'c1' });
      prisma.$transaction.mockImplementation((ops: any[]) => Promise.resolve(ops));

      const result = await service.reply('c1', 'Oi!');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Oi!');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'c1', direction: 'outbound', body: 'Oi!' },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { updatedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('rejects with BadRequestException and sends nothing when the conversation is not paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
      });

      await expect(service.reply('c1', 'Oi!')).rejects.toThrow(BadRequestException);
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('reactivate()', () => {
    it('resets status, invalidAttempts, and both awaiting flags when paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'paused_human' });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'bot_active' });

      await service.reactivate('c1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          status: 'bot_active',
          invalidAttempts: 0,
          awaitingDeliveryReply: false,
          awaitingMenuItemAnswerId: null,
        },
      });
    });

    it('rejects with BadRequestException and updates nothing when the conversation is not paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'bot_active' });

      await expect(service.reactivate('c1')).rejects.toThrow(BadRequestException);
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('pause()', () => {
    it('sets status to paused_human when the conversation is bot_active', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'bot_active' });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'paused_human' });

      await service.pause('c1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { status: 'paused_human' },
      });
    });

    it('rejects with BadRequestException and updates nothing when the conversation is already paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'paused_human' });

      await expect(service.pause('c1')).rejects.toThrow(BadRequestException);
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('updateName()', () => {
    it('updates the conversation name regardless of status', async () => {
      prisma.conversation.update.mockResolvedValue({ id: 'c1', name: 'Maria' });

      await service.updateName('c1', 'Maria');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Maria' },
      });
    });
  });
});
