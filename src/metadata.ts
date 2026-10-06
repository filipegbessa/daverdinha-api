/* eslint-disable */
// Gerado por scripts/generate-openapi-metadata.ts — não edite à mão.
import * as m0 from './bot-settings/dto/update-bot-settings.dto';
import * as m1 from './menu-items/dto/create-menu-item.dto';
import * as m2 from './menu-items/dto/update-menu-item.dto';
import * as m3 from './menu-items/dto/reorder-menu-items.dto';
import * as m4 from './delivery-locations/dto/update-delivery-location.dto';
import * as m5 from './push-subscriptions/dto/save-push-subscription.dto';
import * as m6 from './push-subscriptions/dto/remove-push-subscription.dto';
import * as m7 from './common/pagination';
import * as m8 from './conversations/dto/list-conversations.dto';
import * as m9 from './conversations/dto/list-messages.dto';
import * as m10 from './conversations/dto/reply.dto';
import * as m11 from './conversations/dto/reply-image.dto';
import * as m12 from './conversations/dto/update-conversation.dto';
import * as m13 from './categories/dto/create-category.dto';
import * as m14 from './categories/dto/update-category.dto';
import * as m15 from './app.controller';
import * as m16 from './bot-settings/bot-settings.controller';
import * as m17 from './menu-items/menu-items.controller';
import * as m18 from './delivery-locations/delivery-locations.controller';
import * as m19 from './delivery-locations/public-delivery-locations.controller';
import * as m20 from './whatsapp/webhook.controller';
import * as m21 from './push-subscriptions/push-subscriptions.controller';
import * as m22 from './conversations/conversations.controller';
import * as m23 from './categories/categories.controller';
import * as m24 from './media/media-retention.controller';
import * as m25 from './openapi/openapi.controller';

export default async () => {
  const t = {};
  return {
    '@nestjs/swagger': {
      models: [
        [
          m0,
          {
            UpdateBotSettingsDto: {
              botEnabled: { required: false, type: () => Boolean },
              welcomeMessage: { required: false, type: () => String },
              invalidAttemptsExceededMessage: {
                required: false,
                type: () => String,
              },
              mediaReceivedMessage: { required: false, type: () => String },
              orderReceivedMessage: { required: false, type: () => String },
            },
          },
        ],
        [
          m1,
          {
            CreateMenuItemDto: {
              order: { required: true, type: () => Number },
              topic: { required: true, type: () => String },
              reply: {
                required: false,
                type: () => String,
                description:
                  'The answer sent for an ordinary item. The system item uses the delivery* fields instead.',
              },
              deliveryPrompt: { required: false, type: () => String },
              deliveryRetryMessage: { required: false, type: () => String },
              deliveryConfirmedMessage: { required: false, type: () => String },
              deliveryNotCoveredMessage: {
                required: false,
                type: () => String,
              },
              deliveryUnrecognizedMessage: {
                required: false,
                type: () => String,
              },
              active: { required: false, type: () => Boolean },
            },
          },
        ],
        [m2, { UpdateMenuItemDto: {} }],
        [
          m3,
          {
            ReorderMenuItemsDto: {
              orderedIds: { required: true, type: () => [String] },
            },
          },
        ],
        [
          m4,
          {
            UpdateDeliveryLocationDto: {
              covered: { required: true, type: () => Boolean },
            },
          },
        ],
        [
          m5,
          {
            SavePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m6,
          {
            RemovePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m7,
          {
            PaginationQueryDto: {
              page: {
                required: false,
                type: () => Number,
                default: 1,
                minimum: 1,
              },
              perPage: {
                required: false,
                type: () => Number,
                description:
                  "Capped so a caller can't turn one request back into a full table scan.",
                minimum: 1,
              },
            },
          },
        ],
        [
          m8,
          {
            ListConversationsDto: {
              q: {
                required: false,
                type: () => String,
                description:
                  'Free text matched against the contact name and the phone number.',
              },
              unread: { required: false, type: () => Boolean },
              categoryId: { required: false, type: () => String },
            },
          },
        ],
        [
          m9,
          {
            ListMessagesDto: {
              since: {
                required: false,
                type: () => Date,
                description:
                  'Poll mode: everything from this instant onwards. Inclusive on purpose \u2014\ntimestamps have millisecond resolution and the bot can write two messages\ninside the same one (a welcome and a menu, back to back). Re-sending the\nboundary message and letting the client drop it by id is correct; a strict\n`>` would silently lose its twin.',
              },
              before: {
                required: false,
                type: () => Date,
                description:
                  'History mode: the page of messages immediately older than this instant.',
              },
              limit: { required: false, type: () => Number, minimum: 1 },
            },
          },
        ],
        [
          m10,
          {
            ReplyDto: {
              text: { required: true, type: () => String },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m11,
          {
            ReplyImageDto: {
              caption: { required: false, type: () => String },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m12,
          {
            UpdateConversationDto: {
              name: { required: true, type: () => String },
            },
          },
        ],
        [
          m13,
          {
            CreateCategoryDto: {
              name: { required: true, type: () => String },
              color: { required: true, type: () => String },
            },
          },
        ],
        [m14, { UpdateCategoryDto: {} }],
      ],
      controllers: [
        [m15, { AppController: { health: {} } }],
        [
          m16,
          {
            BotSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m17,
          {
            MenuItemsController: {
              list: { type: Object },
              findOne: {},
              create: {},
              reorder: {},
              update: {},
              remove: {},
            },
          },
        ],
        [
          m18,
          {
            DeliveryLocationsController: { list: { type: Object }, update: {} },
          },
        ],
        [
          m19,
          {
            PublicDeliveryLocationsController: {
              listCovered: { type: [Object] },
            },
          },
        ],
        [m20, { WebhookController: { verify: { type: String }, receive: {} } }],
        [m21, { PushSubscriptionsController: { save: {}, remove: {} } }],
        [
          m22,
          {
            ConversationsController: {
              list: {},
              getOne: {},
              listMessages: { type: [Object] },
              mediaUrl: {
                summary:
                  'Devolve `{ url }`, n\u00E3o os bytes nem um redirect \u2014 ver `mediaUrl` no\nservice para o porqu\u00EA (resumo: `<img>` n\u00E3o manda header de auth).',
              },
              updateName: {},
              reply: {},
              replyImage: {
                summary:
                  'Multipart: o arquivo no campo `file`, legenda e cita\u00E7\u00E3o como campos de\ntexto. Tipo e tamanho s\u00E3o conferidos no service, junto da regra de status\n\u2014 mas o teto de tamanho tamb\u00E9m tem que estar aqui: sem `limits.fileSize`,\no Multer bufferiza o arquivo inteiro em mem\u00F3ria antes do service ter\nchance de rejeitar, e um upload de centenas de MB pode esgotar a mem\u00F3ria\nda fun\u00E7\u00E3o. O Multer corta a leitura ao cruzar o teto.',
              },
              reactivate: {},
              pause: {},
              addCategory: {},
              removeCategory: {},
            },
          },
        ],
        [
          m23,
          {
            CategoriesController: {
              list: {},
              create: {},
              update: {},
              remove: {},
            },
          },
        ],
        [
          m24,
          {
            MediaRetentionController: {
              run: {
                summary:
                  'Ordem dentro do job: **apagar \u2192 reconciliar**. Reconciliar antes\ngravaria um n\u00FAmero que a purga desta mesma execu\u00E7\u00E3o ia invalidar em\nseguida.',
              },
            },
          },
        ],
        [m25, { OpenApiController: { get: { type: Object } } }],
      ],
    },
  };
};
