import { Test } from '@nestjs/testing';
import { DeliveryCheckService } from './delivery-check.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { DeliveryLocationsService } from '../delivery-locations/delivery-locations.service';

describe('DeliveryCheckService', () => {
  let service: DeliveryCheckService;
  let prisma: any;
  let whatsapp: { sendText: jest.Mock };
  let botSettings: { get: jest.Mock };
  let deliveryLocations: { list: jest.Mock };

  const locations = [
    { id: 'l1', zone: 'Zona Sul', regionName: 'Ipanema', covered: true },
    { id: 'l2', zone: 'Zona Oeste', regionName: 'Barra da Tijuca', covered: false },
  ];

  beforeEach(async () => {
    prisma = { conversation: { update: jest.fn() }, message: { create: jest.fn() } };
    whatsapp = { sendText: jest.fn() };
    botSettings = {
      get: jest
        .fn()
        .mockResolvedValue({ deliveryPrompt: 'Qual o bairro?', deliveryWaitMessage: 'Aguarde!' }),
    };
    deliveryLocations = { list: jest.fn().mockResolvedValue(locations) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryCheckService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
        { provide: BotSettingsService, useValue: botSettings },
        { provide: DeliveryLocationsService, useValue: deliveryLocations },
      ],
    }).compile();

    service = moduleRef.get(DeliveryCheckService);
  });

  it('start() sends the delivery prompt and marks the conversation as awaiting a reply', async () => {
    const conversation = { id: 'c1', phone: '5521999999999' };
    await service.start(conversation);
    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Qual o bairro?');
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'outbound', body: 'Qual o bairro?' },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingDeliveryReply: true },
    });
  });

  it('handleReply() with a covered region sends the wait message and escalates to paused_human', async () => {
    const conversation = { id: 'c1', phone: '5521999999999' };
    await service.handleReply(conversation, 'ipanema');
    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Aguarde!');
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'outbound', body: 'Aguarde!' },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingDeliveryReply: false, status: 'paused_human' },
    });
  });

  it('handleReply() with a non-covered region informs the person and clears the awaiting flag without escalating', async () => {
    const conversation = { id: 'c1', phone: '5521999999999' };
    await service.handleReply(conversation, 'barra da tijuca');
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5521999999999',
      expect.stringContaining('não'),
    );
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c1',
        direction: 'outbound',
        body: expect.stringContaining('não'),
      },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingDeliveryReply: false },
    });
  });

  it('handleReply() with an unrecognized region escalates to paused_human for manual confirmation', async () => {
    const conversation = { id: 'c1', phone: '5521999999999' };
    await service.handleReply(conversation, 'lugar nenhum conhecido');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingDeliveryReply: false, status: 'paused_human' },
    });
  });

  it('handleReply() matches regardless of accents/case (normalizeText)', async () => {
    const conversation = { id: 'c1', phone: '5521999999999' };
    await service.handleReply(conversation, 'IPÁNEMA');
    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Aguarde!');
  });
});
