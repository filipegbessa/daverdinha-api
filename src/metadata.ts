/* eslint-disable */
// Gerado por scripts/generate-openapi-metadata.ts — não edite à mão.
import * as m0 from './bot-settings/dto/update-bot-settings.dto';
import * as m1 from './menu-items/dto/create-menu-item.dto';
import * as m2 from './menu-items/dto/update-menu-item.dto';
import * as m3 from './menu-items/dto/reorder-menu-items.dto';
import * as m4 from './delivery-locations/dto/update-delivery-location.dto';
import * as m5 from './delivery-locations/dto/check-cep.dto';
import * as m6 from './delivery-locations/dto/create-delivery-area.dto';
import * as m7 from './delivery-locations/dto/update-delivery-area.dto';
import * as m8 from './delivery-locations/dto/set-area-locations.dto';
import * as m9 from './push-subscriptions/dto/save-push-subscription.dto';
import * as m10 from './push-subscriptions/dto/remove-push-subscription.dto';
import * as m11 from './common/pagination';
import * as m12 from './conversations/dto/list-conversations.dto';
import * as m13 from './conversations/dto/list-messages.dto';
import * as m14 from './conversations/dto/reply.dto';
import * as m15 from './conversations/dto/reply-image.dto';
import * as m16 from './conversations/dto/reply-audio.dto';
import * as m17 from './conversations/dto/update-conversation.dto';
import * as m18 from './categories/dto/create-category.dto';
import * as m19 from './categories/dto/update-category.dto';
import * as m20 from './product-categories/dto/create-product-category.dto';
import * as m21 from './product-categories/dto/update-product-category.dto';
import * as m22 from './products/dto/create-product.dto';
import * as m23 from './products/dto/update-product.dto';
import * as m24 from './products/dto/list-products.dto';
import * as m25 from './store-settings/dto/update-store-settings.dto';
import * as m26 from './app.controller';
import * as m27 from './bot-settings/bot-settings.controller';
import * as m28 from './menu-items/menu-items.controller';
import * as m29 from './delivery-locations/delivery-locations.controller';
import * as m30 from './delivery-locations/public-delivery-locations.controller';
import * as m31 from './delivery-locations/delivery-areas.controller';
import * as m32 from './whatsapp/webhook.controller';
import * as m33 from './push-subscriptions/push-subscriptions.controller';
import * as m34 from './conversations/conversations.controller';
import * as m35 from './categories/categories.controller';
import * as m36 from './media/media-retention.controller';
import * as m37 from './openapi/docs-page.controller';
import * as m38 from './product-categories/product-categories.controller';
import * as m39 from './product-categories/public-product-categories.controller';
import * as m40 from './products/products.controller';
import * as m41 from './products/public-products.controller';
import * as m42 from './openapi/openapi.controller';
import * as m43 from './store-settings/store-settings.controller';
import * as m44 from './store-settings/public-store-settings.controller';

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
        [m5, { CheckCepDto: { cep: { required: false, type: () => String } } }],
        [
          m6,
          {
            CreateDeliveryAreaDto: {
              zone: {
                required: true,
                type: () => String,
                description:
                  'Uma das zonas que j\u00E1 existem nos bairros (`DeliveryLocation.zone`).',
              },
              name: { required: true, type: () => String, maxLength: 60 },
              fee: {
                required: true,
                type: () => Number,
                description:
                  'Valor da entrega pra qualquer bairro da \u00E1rea, em reais.',
                minimum: 0,
                maximum: 9999,
              },
            },
          },
        ],
        [m7, { UpdateDeliveryAreaDto: {} }],
        [
          m8,
          {
            SetAreaLocationsDto: {
              locationIds: {
                required: true,
                type: () => [String],
                description:
                  'A lista inteira de bairros da \u00E1rea; quem ficar de fora sai dela.',
                format: 'uuid',
                maxItems: 500,
              },
            },
          },
        ],
        [
          m9,
          {
            SavePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m10,
          {
            RemovePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m11,
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
          m12,
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
          m13,
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
          m14,
          {
            ReplyDto: {
              text: { required: true, type: () => String },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m15,
          {
            ReplyImageDto: {
              caption: { required: false, type: () => String },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m16,
          {
            ReplyAudioDto: {
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m17,
          {
            UpdateConversationDto: {
              name: { required: true, type: () => String },
            },
          },
        ],
        [
          m18,
          {
            CreateCategoryDto: {
              name: { required: true, type: () => String },
              color: { required: true, type: () => String },
            },
          },
        ],
        [m19, { UpdateCategoryDto: {} }],
        [
          m20,
          {
            CreateProductCategoryDto: {
              name: { required: true, type: () => String },
              description: {
                required: false,
                type: () => String,
                description:
                  'Texto de abertura da p\u00E1gina da categoria no site.',
              },
              active: { required: false, type: () => Boolean },
              order: { required: false, type: () => Number },
            },
          },
        ],
        [m21, { UpdateProductCategoryDto: {} }],
        [
          m22,
          {
            CreateProductDto: {
              name: { required: true, type: () => String },
              description: { required: true, type: () => String },
              price: { required: true, type: () => Number, minimum: 0 },
              categoryId: {
                required: true,
                type: () => String,
                format: 'uuid',
              },
              order: { required: false, type: () => Number },
              active: { required: false, type: () => Boolean },
              featured: {
                required: false,
                type: () => Boolean,
                description:
                  'Aparece na vitrine da home e nas listas das p\u00E1ginas internas.',
              },
              stock: {
                required: false,
                type: () => Number,
                nullable: true,
                description:
                  'Com n\u00FAmero: pronta entrega (0 = esgotado). `null`: sob encomenda.',
                minimum: 0,
              },
              leadTimeDays: {
                required: false,
                type: () => Number,
                nullable: true,
                description:
                  'Prazo de confec\u00E7\u00E3o em dias; obrigat\u00F3rio quando o produto \u00E9 sob encomenda.',
                minimum: 1,
                maximum: 180,
              },
            },
          },
        ],
        [m23, { UpdateProductDto: {} }],
        [
          m24,
          {
            ListProductsDto: {
              q: {
                required: false,
                type: () => String,
                description: 'Parte do nome, sem diferenciar mai\u00FAsculas.',
              },
              categoryId: {
                required: false,
                type: () => String,
                format: 'uuid',
              },
              active: {
                required: false,
                type: () => Boolean,
                description: '"Aparece no site".',
              },
              featured: {
                required: false,
                type: () => Boolean,
                description: '"Mostrar na home".',
              },
            },
          },
        ],
        [
          m25,
          {
            UpdateStoreSettingsDto: {
              pickupEnabled: {
                required: false,
                type: () => Boolean,
                description: 'Desligada, o checkout n\u00E3o oferece retirada.',
              },
              pickupAddress: {
                required: false,
                type: () => String,
                description:
                  'N\u00E3o pode ficar vazio: pra tirar a retirada, desliga `pickupEnabled`.',
                maxLength: 200,
              },
              pickupHours: {
                required: false,
                type: () => String,
                maxLength: 200,
              },
              pickupInstructions: {
                required: false,
                type: () => String,
                nullable: true,
                description:
                  'Texto livre ("toque o interfone 2"); vazio vira `null`.',
                maxLength: 500,
              },
              maxInstallments: {
                required: false,
                type: () => Number,
                description: '1 = s\u00F3 \u00E0 vista.',
                minimum: 1,
                maximum: 12,
              },
              minInstallmentValue: {
                required: false,
                type: () => Number,
                minimum: 0,
                maximum: 99999,
              },
            },
          },
        ],
      ],
      controllers: [
        [m26, { AppController: { health: {} } }],
        [
          m27,
          {
            BotSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m28,
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
          m29,
          {
            DeliveryLocationsController: { list: { type: Object }, update: {} },
          },
        ],
        [
          m30,
          {
            PublicDeliveryLocationsController: {
              listCovered: { type: [Object] },
              check: {
                summary:
                  '"Entregamos no seu CEP?" do site, com a mesma resposta que o bot d\u00E1.',
                type: Object,
              },
            },
          },
        ],
        [
          m31,
          {
            DeliveryAreasController: {
              list: { type: [Object] },
              create: { type: Object },
              update: { type: Object },
              remove: {},
              setLocations: { type: Object },
            },
          },
        ],
        [m32, { WebhookController: { verify: { type: String }, receive: {} } }],
        [m33, { PushSubscriptionsController: { save: {}, remove: {} } }],
        [
          m34,
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
              replyAudio: {
                summary:
                  'Mesmo formato de `reply-image`, sem legenda. O teto do Multer \u00E9 o de\n\u00E1udio (16 MB), pelo mesmo motivo de l\u00E1.',
              },
              reactivate: {},
              pause: {},
              addCategory: {},
              removeCategory: {},
            },
          },
        ],
        [
          m35,
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
          m36,
          {
            MediaRetentionController: {
              run: {
                summary:
                  'Ordem dentro do job: **apagar \u2192 reconciliar**. Reconciliar antes\ngravaria um n\u00FAmero que a purga desta mesma execu\u00E7\u00E3o ia invalidar em\nseguida.',
              },
            },
          },
        ],
        [m37, { DocsPageController: { page: { type: String } } }],
        [
          m38,
          {
            ProductCategoriesController: {
              list: { type: Object },
              create: {},
              update: {},
              remove: {},
            },
          },
        ],
        [
          m39,
          {
            PublicProductCategoriesController: {
              listActive: { type: [Object] },
            },
          },
        ],
        [
          m40,
          {
            ProductsController: {
              list: {},
              findOne: { type: Object },
              create: { type: Object },
              update: { type: Object },
              remove: {},
            },
          },
        ],
        [
          m41,
          {
            PublicProductsController: {
              listActive: { type: [Object] },
              findBySlug: { type: Object },
            },
          },
        ],
        [m42, { OpenApiController: { get: { type: Object } } }],
        [
          m43,
          {
            StoreSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m44,
          { PublicStoreSettingsController: { getPublic: { type: Object } } },
        ],
      ],
    },
  };
};
