import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: {
    conversation: any;
    message: any;
    conversationCategory: any;
    $transaction: jest.Mock;
  };
  let whatsapp: { sendText: jest.Mock };

  beforeEach(async () => {
    prisma = {
      conversation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      message: { create: jest.fn(), findMany: jest.fn() },
      conversationCategory: { upsert: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    whatsapp = {
      sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wamid.out' }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
        // The real messenger over the same prisma/whatsapp mocks: replying
        // has to both reach WhatsApp and land in the transcript, and that
        // pairing is what these assertions check.
        ConversationMessengerService,
      ],
    }).compile();
    service = moduleRef.get(ConversationsService);
  });

  describe('list()', () => {
    beforeEach(() => {
      prisma.conversation.count.mockResolvedValue(0);
    });

    it('returns a page of conversations with the categories flattened', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: '1',
          phone: '5521999999999',
          unread: true,
          categories: [{ category: { id: 'cat1', name: 'Bingo' } }],
        },
        { id: '2', phone: '5521988888888', unread: false, categories: [] },
      ]);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.list();

      expect(prisma.conversation.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
        include: { categories: { include: { category: true } } },
      });
      expect(result).toEqual({
        items: [
          {
            id: '1',
            phone: '5521999999999',
            unread: true,
            categories: [{ id: 'cat1', name: 'Bingo' }],
          },
          { id: '2', phone: '5521988888888', unread: false, categories: [] },
        ],
        page: 1,
        perPage: 20,
        total: 1,
        totalPages: 1,
        unreadTotal: 1,
      });
    });

    it("no longer loads each conversation's last message — unread is a column now", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.list();

      const [args] = prisma.conversation.findMany.mock.calls[0];
      expect(args.include.messages).toBeUndefined();
    });

    it('skips the pages before the one asked for', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(45);

      const result = await service.list({ page: 3, perPage: 10 });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result).toMatchObject({
        page: 3,
        perPage: 10,
        total: 45,
        totalPages: 5,
      });
    });

    it('counts the filtered total separately from the global unread count', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(9);

      const result = await service.list({ unread: true });

      expect(result.total).toBe(3);
      expect(result.unreadTotal).toBe(9);
    });

    it('filters unread in the database, not in the browser', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.list({ unread: true });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unread: true } }),
      );
    });

    it('searches name case-insensitively and phone by substring', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.list({ q: '  maria  ' });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'maria', mode: 'insensitive' } },
              { phone: { contains: 'maria' } },
            ],
          },
        }),
      );
    });

    it('ignores a blank search instead of matching everything on an empty string', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.list({ q: '   ' });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters by category through the join table', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.list({ categoryId: 'cat1' });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categories: { some: { categoryId: 'cat1' } } },
        }),
      );
    });

    it('counts unread across everything, ignoring the active filters — it feeds the nav badge', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(7);

      const result = await service.list({ q: 'maria', categoryId: 'cat1' });

      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: { unread: true },
      });
      expect(result.unreadTotal).toBe(7);
    });
  });

  describe('getWithMessages()', () => {
    it('returns only the tail of the transcript, oldest-first, flagging that more exists', async () => {
      const messages = Array.from({ length: 4 }, (_, i) => ({ id: `m${i}` }));
      prisma.conversation.findUnique.mockResolvedValue({
        id: '1',
        categories: [{ category: { id: 'cat1', name: 'Bingo' } }],
        messages,
      });

      const result = await service.getWithMessages('1', 3);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: {
          // newest-first so the database can stop at `take`
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 4,
            include: { order: { include: { items: true } } },
          },
          categories: { include: { category: true } },
        },
      });
      expect(result.hasMoreMessages).toBe(true);
      expect(result.messages.map((m: { id: string }) => m.id)).toEqual([
        'm2',
        'm1',
        'm0',
      ]);
      expect(result.categories).toEqual([{ id: 'cat1', name: 'Bingo' }]);
    });

    it('reports no more history when the tail fits in one page', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: '1',
        categories: [],
        messages: [{ id: 'm0' }],
      });

      const result = await service.getWithMessages('1', 3);

      expect(result.hasMoreMessages).toBe(false);
      expect(result.messages).toEqual([{ id: 'm0' }]);
    });
  });

  describe('listMessages()', () => {
    it('poll mode: everything from `since` onwards, inclusive, oldest-first', async () => {
      const since = new Date('2026-09-16T12:00:00Z');
      prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.listMessages('c1', { since });

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'c1', createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { order: { include: { items: true } } },
      });
      expect(result).toEqual([{ id: 'm1' }]);
    });

    it('history mode: the page just older than `before`, handed back oldest-first', async () => {
      const before = new Date('2026-09-16T12:00:00Z');
      prisma.message.findMany.mockResolvedValue([{ id: 'm3' }, { id: 'm2' }]);

      const result = await service.listMessages('c1', { before, limit: 2 });

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'c1', createdAt: { lt: before } },
        orderBy: { createdAt: 'desc' },
        take: 2,
        include: { order: { include: { items: true } } },
      });
      expect(result).toEqual([{ id: 'm2' }, { id: 'm3' }]);
    });

    it('with neither bound, returns the newest page', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      await service.listMessages('c1');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'c1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  it('getWithMessages() throws NotFoundException when the conversation does not exist', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(service.getWithMessages('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('reply()', () => {
    it('sends the text via WhatsApp, persists it, and marks the conversation read when paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        phone: '5521999999999',
        status: 'paused_human',
      });
      const created = {
        id: 'm1',
        conversationId: 'c1',
        direction: 'outbound',
        body: 'Oi!',
      };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      const result = await service.reply('c1', 'Oi!');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Oi!');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'outbound',
          body: 'Oi!',
          whatsappMessageId: 'wamid.out',
        },
      });
      // The messenger owns this now: an operator reply is outbound, so the
      // conversation stops being unread, and the update bumps updatedAt with it.
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { unread: false },
      });
      expect(result).toBe(created);
    });

    it('rejects with BadRequestException and sends nothing when the conversation is not paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
      });

      await expect(service.reply('c1', 'Oi!')).rejects.toThrow(
        BadRequestException,
      );
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('reactivate()', () => {
    it('resets status, invalidAttempts, and both awaiting flags when paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        status: 'paused_human',
      });
      prisma.conversation.update.mockResolvedValue({
        id: 'c1',
        status: 'bot_active',
      });

      await service.reactivate('c1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          status: 'bot_active',
          invalidAttempts: 0,
          awaitingDeliveryReply: false,
        },
      });
    });

    it('rejects with BadRequestException and updates nothing when the conversation is not paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        status: 'bot_active',
      });

      await expect(service.reactivate('c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('pause()', () => {
    it('sets status to paused_human when the conversation is bot_active', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        status: 'bot_active',
      });
      prisma.conversation.update.mockResolvedValue({
        id: 'c1',
        status: 'paused_human',
      });

      await service.pause('c1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { status: 'paused_human' },
      });
    });

    it('rejects with BadRequestException and updates nothing when the conversation is already paused_human', async () => {
      prisma.conversation.findUniqueOrThrow.mockResolvedValue({
        id: 'c1',
        status: 'paused_human',
      });

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
