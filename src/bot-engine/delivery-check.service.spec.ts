import { Test } from '@nestjs/testing';
import { DeliveryCheckService } from './delivery-check.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';
import { CepLookupService } from '../cep-lookup/cep-lookup.service';

describe('DeliveryCheckService', () => {
  let service: DeliveryCheckService;
  let prisma: { conversation: any; message: any };
  let whatsapp: { sendText: jest.Mock };
  let menuItems: { findSystemDeliveryItem: jest.Mock };
  let deliveryLocations: { list: jest.Mock };
  let cepLookup: { lookup: jest.Mock };

  const messages = {
    deliveryPrompt: 'Qual o CEP para entrega?',
    deliveryConfirmedMessage: 'Aguarde!',
    deliveryNotCoveredMessage: 'Ainda não chegamos aí, mas em breve!',
    deliveryRetryMessage: 'Esse não é um CEP válido, quer tentar novamente?',
    deliveryUnrecognizedMessage: 'Não consegui identificar seu CEP, vou te chamar um atendente!',
  };

  const locations = [
    { id: 'l1', zone: 'Zona Sul', regionName: 'Ipanema', covered: true, cepRanges: [{ startCep: 22410000, endCep: 22471999 }] },
    { id: 'l2', zone: 'Zona Oeste', regionName: 'Barra da Tijuca', covered: false, cepRanges: [{ startCep: 22600000, endCep: 22799999 }] },
  ];

  beforeEach(async () => {
    prisma = { conversation: { update: jest.fn() }, message: { create: jest.fn() } };
    whatsapp = { sendText: jest.fn() };
    menuItems = { findSystemDeliveryItem: jest.fn().mockResolvedValue(messages) };
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
      ],
    }).compile();

    service = moduleRef.get(DeliveryCheckService);
  });

  describe('start()', () => {
    it('sends the CEP prompt, marks awaitingDeliveryReply, and resets invalidAttempts', async () => {
      const conversation = { id: 'c1', phone: '5521999999999' };
      await service.start(conversation);

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Qual o CEP para entrega?');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: true, invalidAttempts: 0 },
      });
    });
  });

  describe('handleReply() — local range match', () => {
    it('confirms delivery and hands off when the CEP is in a covered local range', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 0 };
      await service.handleReply(conversation, '22440-000');

      expect(cepLookup.lookup).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Aguarde!');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
    });

    it('sends the not-covered message and hands off when the CEP is in a non-covered local range', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 0 };
      await service.handleReply(conversation, '22650000');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Ainda não chegamos aí, mas em breve!');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
    });
  });

  describe('handleReply() — API fallback', () => {
    it('falls back to the API when no local range matches, and confirms on a covered bairro match', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'ipánema' });
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 0 };

      await service.handleReply(conversation, '22999999');

      expect(cepLookup.lookup).toHaveBeenCalledWith('22999999');
      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Aguarde!');
    });

    it('sends not-covered when the API resolves a bairro that exists but is not in our list', async () => {
      cepLookup.lookup.mockResolvedValue({ bairro: 'Copacabana Fictícia' });
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 0 };

      await service.handleReply(conversation, '99999999');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Ainda não chegamos aí, mas em breve!');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human' },
      });
    });
  });

  describe('handleReply() — unresolved, retry then handoff', () => {
    it('sends the retry message and does not hand off on the first unresolved attempt (bad format)', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 0 };
      await service.handleReply(conversation, '123');

      expect(cepLookup.lookup).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Esse não é um CEP válido, quer tentar novamente?');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { invalidAttempts: 1 },
      });
    });

    it('sends the retry message on the first unresolved attempt when the API cannot resolve the CEP', async () => {
      cepLookup.lookup.mockResolvedValue(null);
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 0 };

      await service.handleReply(conversation, '22999999');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Esse não é um CEP válido, quer tentar novamente?');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { invalidAttempts: 1 },
      });
    });

    it('sends the unrecognized message and hands off on the second unresolved attempt', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', invalidAttempts: 1 };
      await service.handleReply(conversation, '123');

      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Não consegui identificar seu CEP, vou te chamar um atendente!');
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { awaitingDeliveryReply: false, status: 'paused_human', invalidAttempts: 2 },
      });
    });
  });
});
