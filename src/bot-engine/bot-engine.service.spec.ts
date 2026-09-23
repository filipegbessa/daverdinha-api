import { Test } from '@nestjs/testing';
import { BotEngineService } from './bot-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { MenuItemsService } from '../menu-items/menu-items.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { DeliveryCheckService } from './delivery-check.service';
import { MediaStorageService } from '../media/media-storage.service';

function imageMessagePayload(
  from: string,
  options?: { caption?: string; mediaId?: string; wamid?: string },
) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: options?.wamid,
                  from,
                  type: 'image',
                  image: {
                    id: options?.mediaId ?? 'media123',
                    caption: options?.caption,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

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
  productItems: {
    product_retailer_id: string;
    quantity: string;
    item_price?: string;
    currency?: string;
  }[],
) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  type: 'order',
                  order: { catalog_id: 'cat1', product_items: productItems },
                },
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
  let messenger: ConversationMessengerService;
  let prisma: any;
  let whatsapp: {
    sendText: jest.Mock;
    sendInteractiveList: jest.Mock;
    getProductNames: jest.Mock;
    downloadMedia: jest.Mock;
  };
  let botSettings: { get: jest.Mock };
  let menuItems: { listActive: jest.Mock };
  let deliveryCheck: {
    start: jest.Mock;
    handleReply: jest.Mock;
    registerUnresolvedAttempt: jest.Mock;
  };
  let mediaStorage: { put: jest.Mock; signedUrl: jest.Mock };

  // m1 is the one system item (the delivery-location flow); everything else
  // is the plain topic + reply the admin creates.
  const activeMenu = [
    {
      id: 'm1',
      order: 0,
      topic: 'Locais de entrega',
      isSystem: true,
      reply: null,
      active: true,
    },
    {
      id: 'm2',
      order: 1,
      topic: 'Bingo de Plantas',
      isSystem: false,
      reply: 'Todo sábado às 16h!',
      active: true,
    },
    {
      id: 'm3',
      order: 2,
      topic: 'Falar com um atendente',
      isSystem: false,
      reply: 'Aguarde um pouco que já retorno',
      active: true,
    },
  ];

  beforeEach(async () => {
    prisma = {
      conversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      order: { create: jest.fn() },
      processedWebhookMessage: {
        create: jest
          .fn()
          .mockResolvedValue({ whatsappMessageId: 'wamid.default' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      // Prisma's $transaction takes either an array of operations or an
      // interactive callback; the code under test uses both, so the mock does too.
      $transaction: jest.fn((arg: any) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
      ),
    };
    whatsapp = {
      sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wamid.out' }),
      sendInteractiveList: jest
        .fn()
        .mockResolvedValue({ whatsappMessageId: 'wamid.out' }),
      getProductNames: jest.fn().mockResolvedValue({}),
      downloadMedia: jest.fn().mockResolvedValue({
        ok: true,
        buffer: Buffer.from('fake-image-bytes'),
        mimeType: 'image/jpeg',
        sizeBytes: 17,
      }),
    };
    botSettings = {
      get: jest.fn().mockResolvedValue({
        botEnabled: true,
        welcomeMessage: 'Bem-vinda(o)!',
        invalidAttemptsExceededMessage:
          'Vou te chamar um atendente, só um instante!',
        mediaReceivedMessage: 'Esse tipo de mensagem não é válido por aqui!',
        orderReceivedMessage:
          'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      }),
    };
    menuItems = { listActive: jest.fn().mockResolvedValue(activeMenu) };
    deliveryCheck = {
      start: jest.fn(),
      handleReply: jest.fn(),
      registerUnresolvedAttempt: jest.fn(),
    };
    mediaStorage = {
      put: jest.fn().mockResolvedValue(undefined),
      signedUrl: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BotEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppClientService, useValue: whatsapp },
        { provide: BotSettingsService, useValue: botSettings },
        { provide: MenuItemsService, useValue: menuItems },
        { provide: DeliveryCheckService, useValue: deliveryCheck },
        { provide: MediaStorageService, useValue: mediaStorage },
        ConversationMessengerService,
      ],
    }).compile();

    service = moduleRef.get(BotEngineService);
    messenger = moduleRef.get(ConversationMessengerService);
  });

  describe('deduplicating WhatsApp webhook retries', () => {
    function textMessagePayloadWithId(id: string, from: string, text: string) {
      return {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ id, from, type: 'text', text: { body: text } }],
                },
              },
            ],
          },
        ],
      };
    }

    it('processes a message with a wamid it has not seen before', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      });

      const processed = await service.handleIncomingMessage(
        textMessagePayloadWithId('wamid.1', '5521999999999', 'oi'),
      );

      expect(processed).toEqual({ conversationId: 'c1' });
      expect(prisma.processedWebhookMessage.create).toHaveBeenCalledWith({
        data: { whatsappMessageId: 'wamid.1' },
      });
      expect(whatsapp.sendText).toHaveBeenCalled();
    });

    it('skips reprocessing (and returns false) when the same wamid is delivered again — a webhook retry', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.processedWebhookMessage.create.mockRejectedValue({
        code: 'P2002',
      });

      const processed = await service.handleIncomingMessage(
        textMessagePayloadWithId('wamid.1', '5521999999999', 'oi'),
      );

      expect(processed).toBeNull();
      // Nothing from the normal flow ran — no menu resent, no invalid-attempt
      // registered, no state mutated — this is a no-op on a retry.
      expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    // O wamid é reivindicado ANTES de processar, que é o que faz uma reentrega
    // simultânea virar no-op. Segurar essa reivindicação através de uma falha
    // transforma a reentrega da Meta num descarte silencioso: a mensagem do
    // cliente simplesmente some.
    it('releases the wamid claim when processing blows up, so the retry is not dropped', async () => {
      prisma.conversation.findFirst.mockRejectedValue(new Error('db down'));

      await expect(
        service.handleIncomingMessage(
          textMessagePayloadWithId('wamid.7', '5521999999999', 'oi'),
        ),
      ).rejects.toThrow('db down');

      expect(prisma.processedWebhookMessage.delete).toHaveBeenCalledWith({
        where: { whatsappMessageId: 'wamid.7' },
      });
    });

    it('still surfaces the original failure if releasing the claim also fails', async () => {
      prisma.conversation.findFirst.mockRejectedValue(new Error('db down'));
      prisma.processedWebhookMessage.delete.mockRejectedValue(
        new Error('delete failed too'),
      );

      // A falha que importa é a primeira — a segunda não pode mascará-la.
      await expect(
        service.handleIncomingMessage(
          textMessagePayloadWithId('wamid.8', '5521999999999', 'oi'),
        ),
      ).rejects.toThrow('db down');
    });

    it('does not dedupe messages that have no id (defensive — real WhatsApp payloads always include one)', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      });

      const processed = await service.handleIncomingMessage(
        textMessagePayload('5521999999999', 'oi'),
      );

      expect(processed).toEqual({ conversationId: 'c1' });
      expect(prisma.processedWebhookMessage.create).not.toHaveBeenCalled();
    });
  });

  it('on first contact, creates the conversation and sends welcome + menu', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    });

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Oi, boa tarde!'),
    );

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: {
        phone: '5521999999999',
        status: 'bot_active',
        entryPoint: 'menu',
      },
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5521999999999',
      'Bem-vinda(o)!',
    );
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

  it('selecting an ordinary item replies with its registered reply', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'm2' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5521999999999',
      'Todo sábado às 16h!',
    );
  });

  it('selecting the system delivery item delegates to DeliveryCheckService instead of replying directly', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'm1' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
  });

  it('picking any menu item while awaiting a CEP reply cancels the delivery sub-flow so the next free-text message is not misread as a CEP', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: true,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'm3' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { invalidAttempts: 0, awaitingDeliveryReply: false },
    });
    expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
  });

  it('end-to-end: after diverting to another menu item mid-CEP-flow, the next free-text message is treated as a normal reply, not a CEP', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce({
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: true,
      })
      // Reflects the DB after the update this method just made.
      .mockResolvedValueOnce({
        id: 'c1',
        phone: '5521999999999',
        status: 'paused_human',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        updatedAt: new Date(),
      });

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'm3' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    deliveryCheck.handleReply.mockClear();
    whatsapp.sendText.mockClear();

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Ok'),
    );

    expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
    // paused_human with a non-stale handoff: the bot stays silent, it does
    // not send the "Esse não é um CEP válido" message from the old flow.
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('after an ordinary item replies, hands off to a human', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'm2' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human' },
    });
  });

  it('the 3rd invalid reply sends the escalation message before handing off', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 2,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'blablabla'),
    );

    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5521999999999',
      'Vou te chamar um atendente, só um instante!',
    );
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human', invalidAttempts: 3 },
    });
  });

  it('an invalid free-text reply increments invalidAttempts and re-sends the menu, without escalating below 3', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 1,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);
    prisma.conversation.update.mockResolvedValue({
      ...conversation,
      invalidAttempts: 2,
    });

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'blablabla'),
    );

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { invalidAttempts: 2 },
    });
    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('the 3rd invalid reply in a row escalates to paused_human instead of re-sending the menu', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 2,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'blablabla'),
    );

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human', invalidAttempts: 3 },
    });
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
  });

  it('does nothing when the conversation is paused_human (handoff to human already happened)', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'paused_human',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
      updatedAt: new Date(),
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'oi de novo'),
    );

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    // Recording the customer's message marks the conversation unread — that's
    // the whole point of a handoff. What must NOT happen is any change to the
    // conversation's state.
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: expect.anything() }),
      }),
    );
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

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'oi, ainda dá pra comprar?'),
    );

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
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

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Menú'),
    );

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      },
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5521999999999',
      'Bem-vinda(o)!',
    );
    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('typing exactly "menu" works even when the bot is globally disabled', async () => {
    botSettings.get.mockResolvedValue({
      botEnabled: false,
      welcomeMessage: 'Bem-vinda(o)!',
    });
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
      updatedAt: new Date(),
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'menu'),
    );

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

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'menu'),
    );

    expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
  });

  it('a message that merely mentions "menu" (not an exact match) is not treated as the reset keyword', async () => {
    // Falls through to the normal invalid-selection path instead (which
    // itself re-shows the menu as a hint) — the distinguishing signal is
    // the *attempt counter*, not whether the menu gets sent.
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'vocês têm menu vegano?'),
    );

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { invalidAttempts: 1 },
    });
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invalidAttempts: 0 }),
      }),
    );
  });

  it('when the bot is disabled, sends nothing and marks the conversation as paused_human', async () => {
    botSettings.get.mockResolvedValue({
      botEnabled: false,
      welcomeMessage: 'Bem-vinda(o)!',
    });
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Oi'),
    );

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human' },
    });
  });

  it('when the bot is disabled and the conversation is brand new, still creates it but sends nothing', async () => {
    botSettings.get.mockResolvedValue({
      botEnabled: false,
      welcomeMessage: 'Bem-vinda(o)!',
    });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    });

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Oi, boa tarde!'),
    );

    expect(prisma.conversation.create).toHaveBeenCalled();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'paused_human' },
    });
  });

  it('routes a free-text reply to DeliveryCheckService.handleReply when the conversation is awaiting a delivery reply, instead of running normal menu-selection logic', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: true,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Ipanema'),
    );

    expect(deliveryCheck.handleReply).toHaveBeenCalledWith(
      conversation,
      'Ipanema',
    );
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    // DeliveryCheckService owns persisting this reply (annotated with the
    // resolved bairro) — the generic inbound-text persistence must not
    // also save a plain, unannotated copy.
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('processes a delivery-reply even when the bot is globally disabled — the sub-flow is a closed loop that must resolve before handoff', async () => {
    botSettings.get.mockResolvedValue({
      botEnabled: false,
      welcomeMessage: 'Bem-vinda(o)!',
    });
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: true,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', '20220-030'),
    );

    expect(deliveryCheck.handleReply).toHaveBeenCalledWith(
      conversation,
      '20220-030',
    );
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'paused_human' } }),
    );
  });

  it('processes a delivery-reply even when the conversation is already paused_human', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'paused_human',
      invalidAttempts: 0,
      awaitingDeliveryReply: true,
      updatedAt: new Date(),
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', '20220-030'),
    );

    expect(deliveryCheck.handleReply).toHaveBeenCalledWith(
      conversation,
      '20220-030',
    );
  });

  it('a message with context.referred_product creates the conversation with entry_point catalog and skips the menu', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    });

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'text',
                    text: { body: 'Tenho interesse nesse vaso' },
                    context: {
                      referred_product: {
                        catalog_id: 'cat1',
                        product_retailer_id: 'prod1',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: {
        phone: '5521999999999',
        status: 'bot_active',
        entryPoint: 'catalog',
      },
    });
    expect(deliveryCheck.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
    );
    expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
  });

  it('persists every inbound message and every outbound bot reply', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'oi'),
    );

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c1',
        direction: 'inbound',
        kind: 'text',
        body: 'oi',
      },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c1',
        direction: 'outbound',
        body: 'Bem-vinda(o)!',
        whatsappMessageId: 'wamid.out',
      },
    });
  });

  it('persists the interactive menu list itself as an outbound message alongside the sendInteractiveList call', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    });

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Oi, boa tarde!'),
    );

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
        whatsappMessageId: 'wamid.out',
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
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: {
                      list_reply: { id: 'm2', title: 'Bingo de Plantas' },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c1',
        direction: 'inbound',
        kind: 'text',
        body: 'Bingo de Plantas',
      },
    });
    expect(prisma.message.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: 'm2' }),
      }),
    );
  });

  it('does not persist an inbound interactive tap when the webhook payload has no list_reply title', async () => {
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };
    prisma.conversation.findFirst.mockResolvedValue(conversation);

    await service.handleIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5521999999999',
                    type: 'interactive',
                    interactive: { list_reply: { id: 'm2' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.message.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'inbound' }),
      }),
    );
  });

  it('shows the hardcoded menu prompt regardless of what botSettings.get() returns', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    });

    await service.handleIncomingMessage(
      textMessagePayload('5521999999999', 'Oi!'),
    );

    expect(whatsapp.sendInteractiveList).toHaveBeenCalledWith(
      '5521999999999',
      'Como posso te ajudar hoje?',
      'Ver opções',
      expect.any(Array),
    );
  });

  describe('unsupported message types (media, order)', () => {
    // Regression: media sent to a conversation a human was handling fell
    // through the paused_human early return without being recorded at all.
    // The photo vanished from the transcript, and the push fired right after
    // previewed the previous message in the thread — days old.
    it('records and answers media even when a human is already handling the conversation', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'paused_human',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        updatedAt: new Date(),
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'audio'),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Esse tipo de mensagem não é válido por aqui!',
      );
      // The handoff itself must not be disturbed by the bot answering.
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('still records media when the bot is disabled, but stays silent', async () => {
      botSettings.get.mockResolvedValue({
        botEnabled: false,
        mediaReceivedMessage: 'Esse tipo de mensagem não é válido por aqui!',
      });
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'audio'),
      );

      // Recorded, because losing it leaves a hole in the operator's transcript.
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      // Silent, because botEnabled is the shop's master switch.
      expect(whatsapp.sendText).not.toHaveBeenCalled();
    });

    it('an audio message is persisted with a unified invalid-content label, replies, and stays with the bot (no handoff)', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'audio'),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Esse tipo de mensagem não é válido por aqui!',
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'outbound',
          body: 'Esse tipo de mensagem não é válido por aqui!',
          whatsappMessageId: 'wamid.out',
        },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('a sticker message is persisted with the same unified invalid-content label and stays with the bot', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'sticker'),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('a video message is persisted with the same unified invalid-content label and stays with the bot', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'video'),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('an unrecognized message type still gets the same invalid-content treatment, instead of being silently dropped', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'unknown_future_type'),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('an audio message during an in-progress delivery-CEP wait replies with the invalid-content message, instead of being treated as the CEP reply, and does not hand off', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: true,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        mediaMessagePayload('5521999999999', 'audio'),
      );

      expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('a catalog order message looks up the product name, stores structured order items, tags the message as an order, and starts the delivery-location flow', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      whatsapp.getProductNames.mockResolvedValue({
        'vaso-01': 'Vaso de Cerâmica',
      });

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          {
            product_retailer_id: 'vaso-01',
            quantity: '2',
            item_price: '35.00',
            currency: 'BRL',
          },
        ]),
      );

      expect(whatsapp.getProductNames).toHaveBeenCalledWith('cat1', [
        'vaso-01',
      ]);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'c1', direction: 'inbound', kind: 'order' },
      });
      expect(prisma.order.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          messageId: 'msg1',
          catalogId: 'cat1',
          items: {
            create: [
              {
                productRetailerId: 'vaso-01',
                productName: 'Vaso de Cerâmica',
                quantity: 2,
                unitPrice: '35.00',
                currency: 'BRL',
              },
            ],
          },
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

    it('falls back to an undefined product name when the catalog lookup has no name for it', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      whatsapp.getProductNames.mockResolvedValue({});

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          {
            product_retailer_id: 'vaso-01',
            quantity: '2',
            item_price: '35.00',
            currency: 'BRL',
          },
        ]),
      );

      expect(
        prisma.order.create.mock.calls[0][0].data.items.create[0].productName,
      ).toBeUndefined();
    });

    it('a catalog order with multiple items stores one order item per line', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      whatsapp.getProductNames.mockResolvedValue({
        'vaso-01': 'Vaso de Cerâmica',
        'muda-samambaia': 'Muda de Samambaia',
      });

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          {
            product_retailer_id: 'vaso-01',
            quantity: '2',
            item_price: '35.00',
            currency: 'BRL',
          },
          {
            product_retailer_id: 'muda-samambaia',
            quantity: '1',
            item_price: '18.50',
            currency: 'BRL',
          },
        ]),
      );

      expect(prisma.order.create.mock.calls[0][0].data.items.create).toEqual([
        {
          productRetailerId: 'vaso-01',
          productName: 'Vaso de Cerâmica',
          quantity: 2,
          unitPrice: '35.00',
          currency: 'BRL',
        },
        {
          productRetailerId: 'muda-samambaia',
          productName: 'Muda de Samambaia',
          quantity: 1,
          unitPrice: '18.50',
          currency: 'BRL',
        },
      ]);
    });

    it('still answers a catalog order even when the conversation is already paused_human', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'paused_human',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        updatedAt: new Date(),
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          {
            product_retailer_id: 'vaso-01',
            quantity: '1',
            item_price: '35.00',
            currency: 'BRL',
          },
        ]),
      );

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      );
      expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
    });

    it('still answers a catalog order even when the bot is globally disabled', async () => {
      botSettings.get.mockResolvedValue({
        botEnabled: false,
        orderReceivedMessage:
          'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      });
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          {
            product_retailer_id: 'vaso-01',
            quantity: '1',
            item_price: '35.00',
            currency: 'BRL',
          },
        ]),
      );

      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
      );
      expect(deliveryCheck.start).toHaveBeenCalledWith(conversation);
    });

    it('marks the conversation unread when a catalog order arrives, like any other inbound message', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        orderMessagePayload('5521999999999', [
          { product_retailer_id: 'p1', quantity: '1' },
        ]),
      );

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { unread: true },
      });
    });
  });

  describe('image messages', () => {
    it('downloads from Meta, uploads to R2, and records the message as kind image with the media columns', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(imageMessagePayload('5521999999999'));

      expect(whatsapp.downloadMedia).toHaveBeenCalledWith('media123');
      expect(mediaStorage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^conversations\/c1\/[0-9a-f-]{36}\.jpg$/),
        Buffer.from('fake-image-bytes'),
        'image/jpeg',
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'image',
          body: null,
          mediaKey: expect.stringMatching(
            /^conversations\/c1\/[0-9a-f-]{36}\.jpg$/,
          ),
          mediaMimeType: 'image/jpeg',
          mediaSizeBytes: 17,
        },
      });
    });

    it('uses the caption as the message body, without treating it as a command', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        imageMessagePayload('5521999999999', { caption: 'menu' }),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: 'menu' }),
      });
      // A captioned "menu" must not reset the conversation the way typing
      // the bare word does — the caption is content, never a command.
      expect(prisma.conversation.update).not.toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          status: 'bot_active',
          invalidAttempts: 0,
          awaitingDeliveryReply: false,
        },
      });
    });

    it('in bot_active, behaves like an unmatched menu selection — spends an attempt and re-shows the menu', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(imageMessagePayload('5521999999999'));

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { invalidAttempts: 1 },
      });
      expect(whatsapp.sendInteractiveList).toHaveBeenCalled();
    });

    it('records and answers even when a human is already handling the conversation, without disturbing the handoff', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'paused_human',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        updatedAt: new Date(),
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(imageMessagePayload('5521999999999'));

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'image' }),
      });
      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('during the delivery-CEP wait, records the image then registers an unresolved attempt instead of running menu-selection', async () => {
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: true,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(
        imageMessagePayload('5521999999999', { caption: 'aqui ó' }),
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'image', body: 'aqui ó' }),
      });
      expect(deliveryCheck.registerUnresolvedAttempt).toHaveBeenCalledWith(
        conversation,
      );
      // DeliveryCheckService.handleReply records its own message as text —
      // it must not also run here, since the image is already recorded.
      expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
      expect(whatsapp.sendInteractiveList).not.toHaveBeenCalled();
    });

    it('a download that fails definitively (unsupported type/too large) gets the same invalid-content treatment as other unreadable media', async () => {
      whatsapp.downloadMedia.mockResolvedValue({
        ok: false,
        reason: 'too-large',
      });
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(imageMessagePayload('5521999999999'));

      expect(mediaStorage.put).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'c1',
          direction: 'inbound',
          kind: 'invalid_content',
          body: '[Conteúdo inválido]',
        },
      });
      expect(whatsapp.sendText).toHaveBeenCalledWith(
        '5521999999999',
        'Esse tipo de mensagem não é válido por aqui!',
      );
    });

    it('a download that fails during the delivery-CEP wait is treated as invalid content, not as the CEP reply', async () => {
      whatsapp.downloadMedia.mockResolvedValue({
        ok: false,
        reason: 'unsupported-type',
      });
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: true,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await service.handleIncomingMessage(imageMessagePayload('5521999999999'));

      expect(deliveryCheck.registerUnresolvedAttempt).not.toHaveBeenCalled();
      expect(deliveryCheck.handleReply).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'invalid_content' }),
      });
    });

    it('a transient download failure (network/5xx/timeout) is not swallowed — it releases the wamid claim so Meta redelivery gets a fresh attempt', async () => {
      whatsapp.downloadMedia.mockRejectedValue(new Error('ECONNRESET'));
      const conversation = {
        id: 'c1',
        phone: '5521999999999',
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      };
      prisma.conversation.findFirst.mockResolvedValue(conversation);

      await expect(
        service.handleIncomingMessage(
          imageMessagePayload('5521999999999', { wamid: 'wamid.guarded' }),
        ),
      ).rejects.toThrow('ECONNRESET');

      expect(mediaStorage.put).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.processedWebhookMessage.delete).toHaveBeenCalledWith({
        where: { whatsappMessageId: 'wamid.guarded' },
      });
    });
  });

  describe('propagating the wamid and quoted-message metadata to recordInbound', () => {
    // Citing a message is pure metadata (Task 5): it must reach every
    // recordInbound call site unchanged, without altering how the bot
    // decides to respond.
    const conversation = {
      id: 'c1',
      phone: '5521999999999',
      status: 'bot_active',
      invalidAttempts: 0,
      awaitingDeliveryReply: false,
    };

    it('a normal text message carries its wamid and repliedToWamid into recordInbound', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      const recordInboundSpy = jest.spyOn(messenger, 'recordInbound');

      await service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.999',
                      from: '5521999999999',
                      type: 'text',
                      text: { body: 'oi' },
                      context: { id: 'wamid.parent' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(recordInboundSpy).toHaveBeenCalledWith('c1', 'oi', undefined, {
        whatsappMessageId: 'wamid.999',
        repliedToWamid: 'wamid.parent',
      });
    });

    it('an interactive list-reply carries its wamid and repliedToWamid into recordInbound', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      const recordInboundSpy = jest.spyOn(messenger, 'recordInbound');

      await service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.888',
                      from: '5521999999999',
                      type: 'interactive',
                      interactive: {
                        list_reply: { id: 'm2', title: 'Bingo de Plantas' },
                      },
                      context: { id: 'wamid.parent2' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(recordInboundSpy).toHaveBeenCalledWith(
        'c1',
        'Bingo de Plantas',
        undefined,
        { whatsappMessageId: 'wamid.888', repliedToWamid: 'wamid.parent2' },
      );
    });

    it('an unsupported-content message carries its wamid and repliedToWamid into the recordInbound call inside handleUnsupportedMessage', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      const recordInboundSpy = jest.spyOn(messenger, 'recordInbound');

      await service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.777',
                      from: '5521999999999',
                      type: 'audio',
                      audio: { id: 'media123' },
                      context: { id: 'wamid.parent3' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(recordInboundSpy).toHaveBeenCalledWith(
        'c1',
        '[Conteúdo inválido]',
        'invalid_content',
        { whatsappMessageId: 'wamid.777', repliedToWamid: 'wamid.parent3' },
      );
    });

    it('a successfully downloaded image carries its wamid, repliedToWamid, and media columns into recordInbound', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      const recordInboundSpy = jest.spyOn(messenger, 'recordInbound');

      await service.handleIncomingMessage({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.666',
                      from: '5521999999999',
                      type: 'image',
                      image: { id: 'media123', caption: 'olha só' },
                      context: { id: 'wamid.parent4' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(recordInboundSpy).toHaveBeenCalledWith('c1', 'olha só', 'image', {
        whatsappMessageId: 'wamid.666',
        repliedToWamid: 'wamid.parent4',
        mediaKey: expect.stringMatching(
          /^conversations\/c1\/[0-9a-f-]{36}\.jpg$/,
        ),
        mediaMimeType: 'image/jpeg',
        mediaSizeBytes: 17,
      });
    });

    it('a message with no context (not a reply) reaches recordInbound with repliedToWamid undefined, without breaking', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      const recordInboundSpy = jest.spyOn(messenger, 'recordInbound');

      await service.handleIncomingMessage(
        textMessagePayload('5521999999999', 'oi sem citação'),
      );

      expect(recordInboundSpy).toHaveBeenCalledWith(
        'c1',
        'oi sem citação',
        undefined,
        { whatsappMessageId: undefined, repliedToWamid: undefined },
      );
    });
  });
});
