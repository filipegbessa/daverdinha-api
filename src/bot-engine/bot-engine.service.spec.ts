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

function mediaMessagePayload(from: string, type: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from, type, [type]: { id: 'media123' } }],
            },
          },
        ],
      },
    ],
  };
}

function orderMessagePayload(
  from: string,
  productItems: { product_retailer_id: string; quantity: string; item_price?: string; currency?: string }[],
) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from, type: 'order', order: { catalog_id: 'cat1', product_items: productItems } },
              ],
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
  let whatsapp: { sendText: jest.Mock; sendInteractiveList: jest.Mock; getProductNames: jest.Mock };
  let botSettings: { get: jest.Mock };
  let menuItems: { list: jest.Mock; findOne: jest.Mock };
  let deliveryCheck: { start: jest.Mock; handleReply: jest.Mock };

  const activeMenu = [
    { id: 'm1', order: 0, topic: 'Locais de entrega', type: 'entrega', reply: null, active: true },
    { id: 'm2', order: 1, topic: 'Bingo de Plantas', type: 'texto', reply: 'Todo sábado às 16h!', active: true },
    { id: 'm3', order: 2, topic: 'Falar com um atendente', type: 'atendente', reply: null, active: true },
    { id: 'm4', order: 3, topic: 'Aulas de jardinagem', type: 'pergunta', reply: null, question: 'Qual dia você prefere?', noMatchReply: 'Não entendi o dia, vou te chamar um atendente!', active: true },
  ];

  beforeEach(async () => {
    prisma = {
      conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      message: { create: jest.fn() },
    };
    whatsapp = { sendText: jest.fn(), sendInteractiveList: jest.fn(), getProductNames: jest.fn().mockResolvedValue({}) };
    botSettings = {
      get: jest.fn().mockResolvedValue({
        botEnabled: true,
        welcomeMessage: 'Bem-vinda(o)!',
        invalidAttemptsExceededMessage: 'Vou te chamar um atendente, só um instante!',
        mediaReceivedMessage: 'Esse tipo de mensagem não é válido por aqui!',
        orderReceivedMessage: 'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      }),
    };
    menuItems = { list: jest.fn().mockResolvedValue(activeMenu), findOne: jest.fn() };
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
        { id: 'm4', title: 'Aulas de jardinagem' },
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

  it('after a "texto" item replies, hands off to a human', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm2' } } }] } }] }],
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'paused_human' } });
  });

  it('an "atendente" item with a reply configured sends it before handing off', async () => {
    menuItems.list.mockResolvedValue([
      ...activeMenu,
      { id: 'm5', order: 4, topic: 'Falar com o financeiro', type: 'atendente', reply: 'Já vou te chamar um atendente do financeiro!', active: true },
    ]);
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm5' } } }] } }] }],
    });

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Já vou te chamar um atendente do financeiro!');
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'outbound', body: 'Já vou te chamar um atendente do financeiro!' },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'paused_human' } });
  });

  it('an "atendente" item with no reply configured stays silent before handing off (existing behavior)', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm3' } } }] } }] }],
    });

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'paused_human' } });
  });

  it('the 3rd invalid reply sends the escalation message before handing off', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 2, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'blablabla'));

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Vou te chamar um atendente, só um instante!');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human', invalidAttempts: 3 },
    });
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
    const conversation = { id: 'c1', phone: '5521999999999', status: 'paused_human', invalidAttempts: 0, awaitingDeliveryReply: false, updatedAt: new Date() };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'oi de novo'));

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('reactivates a stale paused_human conversation (30+ days) instead of staying silent', async () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'paused_human',
      invalidAttempts: 2,
      awaitingDeliveryReply: false,
      updatedAt: staleDate,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'oi, ainda dá pra comprar?'));

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        awaitingMenuItemAnswerId: null,
      },
    });
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
  });

  it('typing exactly "menu" resets a paused_human conversation and shows the menu', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'paused_human',
      invalidAttempts: 2,
      awaitingDeliveryReply: true,
      updatedAt: new Date(),
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Menú'));

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        awaitingMenuItemAnswerId: null,
      },
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Bem-vinda(o)!');
    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('typing exactly "menu" works even when the bot is globally disabled', async () => {
    botSettings.get.mockResolvedValue({ botEnabled: false, welcomeMessage: 'Bem-vinda(o)!' });
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
      updatedAt: new Date(),
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'menu'));

    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('typing exactly "menu" cancels an in-progress delivery sub-flow instead of being treated as an address', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: true,
      updatedAt: new Date(),
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'menu'));

    expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('a message that merely mentions "menu" (not an exact match) is not treated as the reset keyword', async () => {
    // Falls through to the normal invalid-selection path instead (which
    // itself re-shows the menu as a hint) — the distinguishing signal is
    // the *attempt counter*, not whether the menu gets sent.
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'vocês têm menu vegano?'));

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { invalidAttempts: 1 },
    });
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ invalidAttempts: 0 }) }),
    );
  });

  it('when the bot is disabled, sends nothing and marks the conversation as paused_human', async () => {
    botSettings.get.mockResolvedValue({ botEnabled: false, welcomeMessage: 'Bem-vinda(o)!' });
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Oi'));

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human' },
    });
  });

  it('when the bot is disabled and the conversation is brand new, still creates it but sends nothing', async () => {
    botSettings.get.mockResolvedValue({ botEnabled: false, welcomeMessage: 'Bem-vinda(o)!' });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Oi, boa tarde!'));

    expect(prisma.conversation.create).toHaveBeenCalled();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human' },
    });
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
        { id: 'm4', title: 'Aulas de jardinagem' },
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
    expect(menuMessageCall[0].data.body).toContain('Aulas de jardinagem');
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

  it('selecting a "pergunta" item sends its question and marks the conversation as awaiting that item\'s answer', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999', type: 'interactive', interactive: { list_reply: { id: 'm4' } } }] } }] }],
    });

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Qual dia você prefere?');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingMenuItemAnswerId: 'm4' },
    });
  });

  it('routes a free-text reply to handleMenuItemAnswerReply when awaiting a menu-item answer', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false, awaitingMenuItemAnswerId: 'm4' };
    prisma.conversation.findFirst.mockResolvedValue(conversation);
    menuItems.findOne.mockResolvedValue({
      id: 'm4',
      noMatchReply: 'Não entendi o dia, vou te chamar um atendente!',
      answerOptions: [
        { keywords: ['sabado'], reply: 'Perfeito, sábado às 10h!' },
        { keywords: ['domingo'], reply: 'Show, domingo às 10h!' },
      ],
    });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Sábado'));

    expect(menuItems.findOne).toHaveBeenCalledWith('m4');
    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Perfeito, sábado às 10h!');
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'c1', direction: 'outbound', body: 'Perfeito, sábado às 10h!' },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingMenuItemAnswerId: null, status: 'paused_human' },
    });
  });

  it('when the reply matches no answer option, sends the item\'s noMatchReply and still hands off', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false, awaitingMenuItemAnswerId: 'm4' };
    prisma.conversation.findFirst.mockResolvedValue(conversation);
    menuItems.findOne.mockResolvedValue({
      id: 'm4',
      noMatchReply: 'Não entendi o dia, vou te chamar um atendente!',
      answerOptions: [{ keywords: ['sabado'], reply: 'Perfeito, sábado às 10h!' }],
    });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'quarta-feira'));

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Não entendi o dia, vou te chamar um atendente!');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { awaitingMenuItemAnswerId: null, status: 'paused_human' },
    });
  });

  it('matches an answer option regardless of accents/case, like the delivery flow', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false, awaitingMenuItemAnswerId: 'm4' };
    prisma.conversation.findFirst.mockResolvedValue(conversation);
    menuItems.findOne.mockResolvedValue({
      id: 'm4',
      noMatchReply: 'Não entendi.',
      answerOptions: [{ keywords: ['sabado'], reply: 'Perfeito, sábado às 10h!' }],
    });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'SÁBADO'));

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Perfeito, sábado às 10h!');
  });

  it('falls back to a generic message when the item has no noMatchReply configured and nothing matches', async () => {
    const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false, awaitingMenuItemAnswerId: 'm4' };
    prisma.conversation.findFirst.mockResolvedValue(conversation);
    menuItems.findOne.mockResolvedValue({
      id: 'm4',
      noMatchReply: null,
      answerOptions: [{ keywords: ['sabado'], reply: 'Perfeito!' }],
    });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'terça'));

    expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Não entendi sua resposta, vou te chamar um atendente!');
  });

  it('shows the hardcoded menu prompt regardless of what botSettings.get() returns', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false });

    await service.handleIncomingMessage(textMessagePayload('5521999999999', 'Oi!'));

    expect(whatsapp.sendInteractiveList).toHaveBeenCalledWith(
      '5521999999999',
      'Como posso te ajudar hoje?',
      'Ver opções',
      expect.any(Array),
    );
  });

  describe('unsupported message types (media, order)', () => {
    it('an image message is ignored entirely for now (no persistence, no reply, no handoff)', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(mediaMessagePayload('5521999999999', 'image'));

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('an audio message is persisted with a unified invalid-content label, replies, and stays with the bot (no handoff)', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(mediaMessagePayload('5521999999999', 'audio'));

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'c1', direction: 'inbound', kind: 'invalid_content', body: '[Conteúdo inválido]' },
      });
      expect(whatsapp.sendText).toHaveBeenCalledWith('5521999999999', 'Esse tipo de mensagem não é válido por aqui!');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'outbound',
          body: 'Esse tipo de mensagem não é válido por aqui!',
        },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('a sticker message is persisted with the same unified invalid-content label and stays with the bot', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(mediaMessagePayload('5521999999999', 'sticker'));

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'c1', direction: 'inbound', kind: 'invalid_content', body: '[Conteúdo inválido]' },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('a video message is persisted with the same unified invalid-content label and stays with the bot', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(mediaMessagePayload('5521999999999', 'video'));

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'c1', direction: 'inbound', kind: 'invalid_content', body: '[Conteúdo inválido]' },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('an unrecognized message type still gets the same invalid-content treatment, instead of being silently dropped', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(mediaMessagePayload('5521999999999', 'unknown_future_type'));

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'c1', direction: 'inbound', kind: 'invalid_content', body: '[Conteúdo inválido]' },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('an audio message during an in-progress delivery-CEP wait replies with the invalid-content message, instead of being treated as the CEP reply, and does not hand off', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: true };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(mediaMessagePayload('5521999999999', 'audio'));

      expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('a catalog order message looks up the product name, formats the price as R$, tags the message as an order, and starts the delivery-location flow', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      whatsapp.getProductNames.mockResolvedValue({ 'vaso-01': 'Vaso de Cerâmica' });

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          { product_retailer_id: 'vaso-01', quantity: '2', item_price: '35.00', currency: 'BRL' },
        ]),
      );

      expect(whatsapp.getProductNames).toHaveBeenCalledWith('cat1', ['vaso-01']);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'order',
          body: 'Pedido pelo catálogo:\n- Vaso de Cerâmica x2 — R$ 35,00',
        },
      });
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      );
      // Handoff to a human happens later, once the delivery-location
      // sub-flow resolves — not immediately after the order confirmation.
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'paused_human' } }),
      );
      expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
    });

    it('falls back to the retailer id when the catalog lookup has no name for it', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      whatsapp.getProductNames.mockResolvedValue({});

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          { product_retailer_id: 'vaso-01', quantity: '2', item_price: '35.00', currency: 'BRL' },
        ]),
      );

      const orderMessageCall = prisma.message.create.mock.calls.find(
        ([{ data }]: [{ data: { body: string; direction: string } }]) => data.direction === 'inbound',
      );
      expect(orderMessageCall[0].data.body).toBe('Pedido pelo catálogo:\n- vaso-01 x2 — R$ 35,00');
    });

    it('a catalog order with multiple items lists every line', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      whatsapp.getProductNames.mockResolvedValue({
        'vaso-01': 'Vaso de Cerâmica',
        'muda-samambaia': 'Muda de Samambaia',
      });

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          { product_retailer_id: 'vaso-01', quantity: '2', item_price: '35.00', currency: 'BRL' },
          { product_retailer_id: 'muda-samambaia', quantity: '1', item_price: '18.50', currency: 'BRL' },
        ]),
      );

      const orderMessageCall = prisma.message.create.mock.calls.find(
        ([{ data }]: [{ data: { body: string; direction: string } }]) => data.direction === 'inbound',
      );
      expect(orderMessageCall[0].data.body).toBe(
        'Pedido pelo catálogo:\n- Vaso de Cerâmica x2 — R$ 35,00\n- Muda de Samambaia x1 — R$ 18,50',
      );
    });

    it('still answers a catalog order even when the conversation is already paused_human', async () => {
      const conversation = { id: 'c1', phone: '5521999999999', status: 'paused_human', invalidAttempts: 0, awaitingDeliveryReply: false, updatedAt: new Date() };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          { product_retailer_id: 'vaso-01', quantity: '1', item_price: '35.00', currency: 'BRL' },
        ]),
      );

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      );
      expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
    });

    it('still answers a catalog order even when the bot is globally disabled', async () => {
      botSettings.get.mockResolvedValue({ botEnabled: false, orderReceivedMessage: 'Aceito! Recebemos seu pedido, já vamos confirmar com você.' });
      const conversation = { id: 'c1', phone: '5521999999999', status: 'bot_active', invalidAttempts: 0, awaitingDeliveryReply: false };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          { product_retailer_id: 'vaso-01', quantity: '1', item_price: '35.00', currency: 'BRL' },
        ]),
      );

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      );
      expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
    });
  });
});
