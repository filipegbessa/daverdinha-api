import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConversationMessengerService } from './conversation-messenger.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { MediaStorageService } from '../media/media-storage.service';

describe('ConversationMessengerService', () => {
  let service: ConversationMessengerService;
  let prisma: {
    message: { create: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock };
    conversation: { update: jest.Mock };
    botSettings: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let mediaStorage: { put: jest.Mock; signedUrl: jest.Mock };
  let whatsapp: {
    sendText: jest.Mock;
    sendInteractiveList: jest.Mock;
    uploadMedia: jest.Mock;
    sendImage: jest.Mock;
  };

  const conversation = { id: 'c1', phone: '5521999999999' };

  beforeEach(async () => {
    prisma = {
      message: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      conversation: { update: jest.fn() },
      botSettings: { update: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    whatsapp = {
      sendText: jest
        .fn()
        .mockResolvedValue({ whatsappMessageId: 'wamid.OUT1' }),
      sendInteractiveList: jest
        .fn()
        .mockResolvedValue({ whatsappMessageId: 'wamid.OUT1' }),
      uploadMedia: jest.fn().mockResolvedValue('media_out_1'),
      sendImage: jest
        .fn()
        .mockResolvedValue({ whatsappMessageId: 'wamid.OUT_IMG' }),
    };
    mediaStorage = { put: jest.fn(), signedUrl: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationMessengerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
        { provide: MediaStorageService, useValue: mediaStorage },
      ],
    }).compile();
    service = moduleRef.get(ConversationMessengerService);
  });

  describe('sendImage()', () => {
    const conversation = { id: 'c1', phone: '5521999999999' };
    const file = { buffer: Buffer.from('png-bytes'), mimeType: 'image/png' };

    it('stores in R2 and uploads to Meta — both, on purpose', async () => {
      await service.sendImage(conversation, file);

      // Os dois destinos: o id da Meta expira em 30 dias, o histórico não.
      expect(mediaStorage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^conversations\/c1\/[0-9a-f-]{36}\.png$/),
        file.buffer,
        'image/png',
      );
      expect(whatsapp.uploadMedia).toHaveBeenCalledWith(
        file.buffer,
        'image/png',
      );
    });

    it('records the outbound message with the media columns and the wamid', async () => {
      await service.sendImage(conversation, file, { caption: 'o vaso novo' });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: 'c1',
          direction: 'outbound',
          kind: 'image',
          body: 'o vaso novo',
          whatsappMessageId: 'wamid.OUT_IMG',
          mediaMimeType: 'image/png',
          mediaSizeBytes: 9,
        }),
      });
    });

    it('counts the bytes against the storage cap, like an inbound photo', async () => {
      await service.sendImage(conversation, file);

      expect(prisma.botSettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mediaBytesUsed: { increment: 9 } },
        }),
      );
    });

    it('quotes a message when asked', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm9',
        conversationId: 'c1',
        whatsappMessageId: 'wamid.original',
      });

      await service.sendImage(conversation, file, { replyToMessageId: 'm9' });

      expect(whatsapp.sendImage).toHaveBeenCalledWith(
        '5521999999999',
        'media_out_1',
        undefined,
        { replyToWamid: 'wamid.original' },
      );
    });

    it('refuses to quote a message that has no wamid, same as sendText', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm9',
        conversationId: 'c1',
        whatsappMessageId: null,
      });

      await expect(
        service.sendImage(conversation, file, { replyToMessageId: 'm9' }),
      ).rejects.toThrow(BadRequestException);
      expect(whatsapp.sendImage).not.toHaveBeenCalled();
    });

    // Subir para a Meta é o passo que pode falhar por cota ou janela de 24h.
    // Gravar antes deixaria o histórico com uma mensagem que ninguém recebeu.
    it('does not record anything when the send fails', async () => {
      whatsapp.sendImage.mockRejectedValue(new Error('fora da janela de 24h'));

      await expect(service.sendImage(conversation, file)).rejects.toThrow();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('sendText()', () => {
    it('without options: sends via WhatsApp and persists with the returned whatsappMessageId', async () => {
      const created = { id: 'm1', conversationId: 'c1', body: 'Oi!' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      const result = await service.sendText(conversation, 'Oi!');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Oi!');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'outbound',
          body: 'Oi!',
          whatsappMessageId: 'wamid.OUT1',
        },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { unread: false },
      });
      expect(result).toBe(created);
    });

    it('with a valid replyToMessageId from the same conversation: quotes on WhatsApp and persists the reply columns', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm-target',
        conversationId: 'c1',
        whatsappMessageId: 'wamid.TARGET',
      });
      const created = { id: 'm2', conversationId: 'c1', body: 'Claro!' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      const result = await service.sendText(conversation, 'Claro!', {
        replyToMessageId: 'm-target',
      });

      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: 'm-target', conversationId: 'c1' },
      });
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Claro!',
        { replyToWamid: 'wamid.TARGET' },
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'outbound',
          body: 'Claro!',
          whatsappMessageId: 'wamid.OUT1',
          repliedToId: 'm-target',
          repliedToWamid: 'wamid.TARGET',
        },
      });
      expect(result).toBe(created);
    });

    it('with a replyToMessageId pointing at a message without whatsappMessageId: throws and never calls WhatsApp', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm-target',
        conversationId: 'c1',
        whatsappMessageId: null,
      });

      await expect(
        service.sendText(conversation, 'Claro!', {
          replyToMessageId: 'm-target',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('with a replyToMessageId belonging to another conversation: throws and never calls WhatsApp', async () => {
      // findUnique is scoped by conversationId in the query itself, so a
      // message from a different conversation simply doesn't match.
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.sendText(conversation, 'Claro!', {
          replyToMessageId: 'm-other-conversation',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: 'm-other-conversation', conversationId: 'c1' },
      });
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('sendMenu()', () => {
    it('persists the whatsappMessageId returned by sendInteractiveList', async () => {
      const created = { id: 'm3', conversationId: 'c1' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      const result = await service.sendMenu(
        conversation,
        'Como posso ajudar?',
        'Ver opções',
        [{ id: 'item-1', title: 'Locais de entrega' }],
      );

      expect(whatsapp.sendInteractiveList).toHaveBeenCalledWith(
        '5521999999999',
        'Como posso ajudar?',
        'Ver opções',
        [{ id: 'item-1', title: 'Locais de entrega' }],
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'outbound',
          body: 'Como posso ajudar?\n- Locais de entrega',
          whatsappMessageId: 'wamid.OUT1',
        },
      });
      expect(result).toBe(created);
    });
  });

  describe('recordInbound()', () => {
    it('without options: behaves exactly like before (backward compatible)', async () => {
      const created = { id: 'm4', conversationId: 'c1', body: 'Oi' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      const result = await service.recordInbound('c1', 'Oi');

      expect(prisma.message.findFirst).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: 'Oi',
          whatsappMessageId: undefined,
          repliedToWamid: undefined,
          repliedToId: undefined,
        },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { unread: true },
      });
      expect(result).toBe(created);
    });

    it('with a repliedToWamid that resolves to an existing message: records repliedToId', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'm-original',
        whatsappMessageId: 'wamid.IN-ORIGINAL',
      });
      const created = { id: 'm5', conversationId: 'c1' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      await service.recordInbound('c1', 'Quero isso', 'text', {
        whatsappMessageId: 'wamid.IN-NEW',
        repliedToWamid: 'wamid.IN-ORIGINAL',
      });

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { whatsappMessageId: 'wamid.IN-ORIGINAL' },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: 'Quero isso',
          whatsappMessageId: 'wamid.IN-NEW',
          repliedToWamid: 'wamid.IN-ORIGINAL',
          repliedToId: 'm-original',
        },
      });
    });

    it('with media columns: persists mediaKey, mediaMimeType, and mediaSizeBytes alongside the message', async () => {
      const created = { id: 'm7', conversationId: 'c1' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      await service.recordInbound('c1', 'olha essa foto', 'image', {
        whatsappMessageId: 'wamid.IN-IMG',
        mediaKey: 'conversations/c1/uuid.jpg',
        mediaMimeType: 'image/jpeg',
        mediaSizeBytes: 123456,
      });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'image',
          body: 'olha essa foto',
          whatsappMessageId: 'wamid.IN-IMG',
          repliedToWamid: undefined,
          repliedToId: undefined,
          mediaKey: 'conversations/c1/uuid.jpg',
          mediaMimeType: 'image/jpeg',
          mediaSizeBytes: 123456,
        },
      });
      // Summed in the same transaction as the message — the Tarefa 11 cap
      // has no other way to stay accurate.
      expect(prisma.botSettings.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { mediaBytesUsed: { increment: 123456 } },
      });
    });

    it('without a mediaSizeBytes: does not touch the storage counter', async () => {
      const created = { id: 'm8', conversationId: 'c1' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      await service.recordInbound('c1', 'oi', 'text');

      expect(prisma.botSettings.update).not.toHaveBeenCalled();
    });

    it('with a repliedToWamid that resolves to nothing: still persists the message, without throwing and without repliedToId', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const created = { id: 'm6', conversationId: 'c1' };
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });

      const result = await service.recordInbound('c1', 'Quero isso', 'text', {
        whatsappMessageId: 'wamid.IN-NEW',
        repliedToWamid: 'wamid.UNKNOWN',
      });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: 'Quero isso',
          whatsappMessageId: 'wamid.IN-NEW',
          repliedToWamid: 'wamid.UNKNOWN',
          repliedToId: undefined,
        },
      });
      expect(result).toBe(created);
    });
  });
});
