import { Test } from '@nestjs/testing';
import { BotEngineService } from './bot-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { DeliveryCheckService } from './delivery-check.service';

function textMessagePayload(from: string, text: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

describe('BotEngineService', () => {
  let service: BotEngineService;
  let prisma: any;
  let whatsapp: { sendText: jest.Mock; sendInteractiveList: jest.Mock };
  let botSettings: { get: jest.Mock };
  let menuItems: { list: jest.Mock };
  let deliveryCheck: { start: jest.Mock; handleReply: jest.Mock };

  const activeMenu = [
    { id: 'm1', order: 0, topic: 'Locais de entrega', type: 'entrega', reply: null, active: true },
    { id: 'm2', order: 1, topic: 'Bingo de Plantas', type: 'texto', reply: 'Todo sábado às 16h!', active: true },
    { id: 'm3', order: 2, topic: 'Falar com um atendente', type: 'atendente', reply: null, active: true },
  ];

  beforeEach(async () => {
    prisma = {
      conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      message: { create: jest.fn() },
    };
    whatsapp = { sendText: jest.fn(), sendInteractiveList: jest.fn() };
    botSettings = { get: jest.fn().mockResolvedValue({ botEnabled: true, welcomeMessage: 'Bem-vinda(o)!' }) };
    menuItems = { list: jest.fn().mockResolvedValue(activeMenu) };
    deliveryCheck = { start: jest.fn(), handleReply: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BotEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
        { provide: BotSettingsService, useValue: botSettings },
        { provide: MenuItemsService, useValue: menuItems },
        { provide: DeliveryCheckService, useValue: deliveryCheck },
      ],
    }).compile();

    service = moduleRef.get(BotEngineService);
  });

  it('on first contact, creates the conversation and sends welcome + menu', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Oi, boa tarde!'));

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { phone: '5521999999999', status: 'bot_active', entryPoint: 'menu' },
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Bem-vinda(o)!');
    expect(whatsapp.sendInteractiveList).toHaveBeenCalledWith(
      '5521999999999',
      expect.any(String),
      expect.any(String),
      [
        { id: 'm1', title: 'Locais de entrega' },
        { id: 'm2', title: 'Bingo de Plantas' },
        { id: 'm3', title: 'Falar com um atendente' },
      ],
    );
  });

  it('selecting a "texto" item replies with the registered reply', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm2' } } }] } }] }],
    });

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Todo sábado às 16h!');
  });

  it('selecting the "entrega" item delegates to DeliveryCheckService instead of replying directly', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm1' } } }] } }] }],
    });

    expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
  });

  it('selecting the "atendente" item marks the conversation as paused_human', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm3' } } }] } }] }],
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'paused_human' } });
  });

  it('an invalid free-text reply increments invalidAttempts and re-sends the menu, without escalating below 3', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 1, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);
    prisma.conversation.update.mockResolvedValue({ ...conversation, invalidAttempts: 2 });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'blablabla'));

    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { invalidAttempts: 2 } });
    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('the 3rd invalid reply in a row escalates to paused_human instead of re-sending the menu', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 2, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'blablabla'));

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human', invalidAttempts: 3 },
    });
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
  });

  it('does nothing when the conversation is paused_human (handoff to human already happened)', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'paused_human', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'oi de novo'));

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
  });

  it('routes a free-text reply to DeliveryCheckService.handleReply when the conversation is awaiting a delivery reply, instead of running normal menu-selection logic', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: true };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Ipanema'));

    expect(deliveryCheck.handleReply).toHaveBeenCalledWith(conversation, 'Ipanema');
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('a message with context.referred_product creates the conversation with entry_point catalog and skips the menu', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false });

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{
        from: '5521999999999',
        type: 'text',
        text: { body: 'Tenho interesse nesse vaso' },
        context: { referred_product: { catalog_id: 'cat1', product_retailer_id: 'prod1' } },
      }] } }] }],
    });

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { phone: '5521999999999', status: 'bot_active', entryPoint: 'catalog' },
    });
    expect(deliveryCheck.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
  });

  it('persists every inbound message and every outbound bot reply', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'oi'));

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'inbound', body: 'oi' },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'outbound', body: 'Bem-vinda(o)!' },
    });
  });

  it('persists the interactive menu list itself as an outbound message alongside the sendInteractiveList call', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Oi, boa tarde!'));

    expect(whatsapp.sendInteractiveList).toHaveBeenCalledWith(
      '5521999999999',
      'Como posso te ajudar hoje?',
      'Ver opções',
      [
        { id: 'm1', title: 'Locais de entrega' },
        { id: 'm2', title: 'Bingo de Plantas' },
        { id: 'm3', title: 'Falar com um atendente' },
      ],
    );
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c1',
        direction: 'outbound',
        body: expect.stringContaining('Como posso te ajudar hoje?'),
      },
    });
    const menuMessageCall = prisma.message.create.mock.calls.find(
      ([{ data }]: [{ data: { body: string } }]) =>
        data.body.includes('Como posso te ajudar hoje?'),
    );
    expect(menuMessageCall[0].data.body).toContain('Locais de entrega');
    expect(menuMessageCall[0].data.body).toContain('Bingo de Plantas');
    expect(menuMessageCall[0].data.body).toContain('Falar com um atendente');
  });

  it('persists an inbound interactive list-reply tap using the human-readable title, not the opaque item id', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{
        from: '5521999999999',
        type: 'interactive',
        interactive: { list_reply: { id: 'm2', title: 'Bingo de Plantas' } },
      }] } }] }],
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'inbound', body: 'Bingo de Plantas' },
    });
    expect(prisma.message.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'm2' }) }),
    );
  });

  it('does not persist an inbound interactive tap when the webhook payload has no list_reply title', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm2' } } }] } }] }],
    });

    expect(prisma.message.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'inbound' }) }),
    );
  });
});
