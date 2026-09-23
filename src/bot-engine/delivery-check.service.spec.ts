import { Test } from '@nestjs/testing';
import { DeliveryCheckService } from './delivery-check.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { MediaStorageService } from '../media/media-storage.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { CepLookupService } from '../cep-lookup/cep-lookup.service';

describe('DeliveryCheckService', () => {
  let service: DeliveryCheckService;
  let prisma: { conversation: any; message: any; $transaction: jest.Mock };
  let whatsapp: { sendText: jest.Mock };
  let menuItems: { findSystemDeliveryItem: jest.Mock };
  let deliveryLocations: { list: jest.Mock };
  let cepLookup: { lookup: jest.Mock };

  const messages = {
    deliveryPrompt: 'Qual o CEP para entrega?',
    deliveryConfirmedMessage:
      'Sim! Entregamos aí no [local], aguarde um pouco que entro em contato',
    deliveryNotCoveredMessage: 'Ainda não chegamos no [local], mas em breve!',
    deliveryRetryMessage: 'Esse não é um CEP válido, quer tentar novamente?',
    deliveryUnrecognizedMessage:
      'Não consegui identificar seu CEP, vou te chamar um atendente!',
  };

  const locations = [
    {
      id: 'l1',
      zone: 'Zona Sul',
      regionName: 'Ipanema',
      covered: true,
      cepRanges: [{ startCep: 22410000, endCep: 22471999 }],
    },
    {
      id: 'l2',
      zone: 'Zona Oeste',
      regionName: 'Barra da Tijuca',
      covered: false,
      cepRanges: [{ startCep: 22600000, endCep: 22799999 }],
    },
  ];

  beforeEach(async () => {
    prisma = {
      conversation: { update: jest.fn() },
      message: { create: jest.fn().mockResolvedValue({ id: 'msg1' }) },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    whatsapp = {
      sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wamid.out' }),
    };
    menuItems = {
      findSystemDeliveryItem: jest.fn().mockResolvedValue(messages),
    };
    deliveryLocations = { list: jest.fn().mockResolvedValue(locations) };
    cepLookup = { lookup: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryCheckService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
        { provide: MenuItemsService, useValue: menuItems },
        { provide: DeliveryLocationsService, useValue: deliveryLocations },
        { provide: CepLookupService, useValue: cepLookup },
        // The real messenger, wired to the same prisma/whatsapp mocks — the
        // send-and-persist pairing is exactly what these tests assert on.
        ConversationMessengerService,
        // O messenger passou a saber mandar imagem, então o módulo de teste
        // precisa do storage — que este fluxo não usa.
        { provide: MediaStorageService, useValue: { put: jest.fn(), signedUrl: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(DeliveryCheckService);
  });

  describe('start()', () => {
    it('sends the CEP prompt, marks awaitingDeliveryReply, and resets invalidAttempts', async () => {
      const conversation = { id: 'c1', phone: '5521999999999' };
      await service.start(conversation);

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Qual o CEP para entrega?',
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: true, invalidAttempts: 0 },
      });
    });
  });

  describe('handleReply() — local range match', () => {
    it('confirms delivery and hands off when the CEP is in a covered local range, filling [local] with the bairro', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };
      await service.handleReply(conversation, '22440-000');

      expect(cepLookup.lookup).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Sim! Entregamos aí no Ipanema, aguarde um pouco que entro em contato',
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
    });

    it('persists the inbound reply annotated with the resolved bairro', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };
      await service.handleReply(conversation, '22440-000');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: '22440-000 (Ipanema)',
        },
      });
    });

    it('sends the not-covered message and hands off when the CEP is in a non-covered local range', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };
      await service.handleReply(conversation, '22650000');

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Ainda não chegamos no Barra da Tijuca, mas em breve!',
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
    });
  });

  describe('handleReply() — API fallback', () => {
    it('falls back to the API when no local range matches, and confirms on a covered bairro match', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'ipánema' });
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };

      await service.handleReply(conversation, '22999999');

      expect(cepLookup.lookup).toHaveBeenCalledWith('22999999');
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Sim! Entregamos aí no Ipanema, aguarde um pouco que entro em contato',
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: '22999999 (Ipanema)',
        },
      });
    });

    it('sends not-covered when the API resolves a bairro that exists but is not in our list', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'Copacabana Fictícia' });
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };

      await service.handleReply(conversation, '99999999');

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Ainda não chegamos no Copacabana Fictícia, mas em breve!',
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: '99999999 (Copacabana Fictícia)',
        },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
    });
  });

  describe('handleReply() — unresolved, retry then handoff', () => {
    it('sends the retry message and does not hand off on the first unresolved attempt (bad format)', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };
      await service.handleReply(conversation, '123');

      expect(cepLookup.lookup).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Esse não é um CEP válido, quer tentar novamente?',
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'text',
          body: '123',
        },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { invalidAttempts: 1 },
      });
    });

    it('sends the retry message on the first unresolved attempt when the API cannot resolve the CEP', async () => {
      cepLookup.lookup.mockResolvedValue(null);
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 0,
      };

      await service.handleReply(conversation, '22999999');

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Esse não é um CEP válido, quer tentar novamente?',
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { invalidAttempts: 1 },
      });
    });

    it('sends the unrecognized message and hands off on the second unresolved attempt', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        invalidAttempts: 1,
      };
      await service.handleReply(conversation, '123');

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Não consegui identificar seu CEP, vou te chamar um atendente!',
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          awaitingDeliveryReply: false,
          status: 'paused_human',
          invalidAttempts: 2,
        },
      });
    });
  });
});
