/* eslint-disable */
// Gerado por scripts/generate-openapi-metadata.ts — não edite à mão.
import * as m0 from './checkout/dto/cart-item.dto';
import * as m1 from './bot-settings/dto/update-bot-settings.dto';
import * as m2 from './menu-items/dto/create-menu-item.dto';
import * as m3 from './menu-items/dto/update-menu-item.dto';
import * as m4 from './menu-items/dto/reorder-menu-items.dto';
import * as m5 from './delivery-locations/dto/update-delivery-location.dto';
import * as m6 from './delivery-locations/dto/check-cep.dto';
import * as m7 from './delivery-locations/dto/create-delivery-area.dto';
import * as m8 from './delivery-locations/dto/update-delivery-area.dto';
import * as m9 from './delivery-locations/dto/set-area-locations.dto';
import * as m10 from './push-subscriptions/dto/save-push-subscription.dto';
import * as m11 from './push-subscriptions/dto/remove-push-subscription.dto';
import * as m12 from './common/pagination';
import * as m13 from './conversations/dto/list-conversations.dto';
import * as m14 from './conversations/dto/list-messages.dto';
import * as m15 from './conversations/dto/reply.dto';
import * as m16 from './conversations/dto/reply-image.dto';
import * as m17 from './conversations/dto/reply-audio.dto';
import * as m18 from './conversations/dto/update-conversation.dto';
import * as m19 from './categories/dto/list-categories.dto';
import * as m20 from './categories/dto/create-category.dto';
import * as m21 from './categories/dto/update-category.dto';
import * as m22 from './product-categories/dto/create-product-category.dto';
import * as m23 from './product-categories/dto/update-product-category.dto';
import * as m24 from './products/dto/create-product.dto';
import * as m25 from './products/dto/update-product.dto';
import * as m26 from './products/dto/list-products.dto';
import * as m27 from './store-settings/dto/update-store-settings.dto';
import * as m28 from './checkout/dto/quote.dto';
import * as m29 from './site-orders/dto/list-site-orders.dto';
import * as m30 from './site-orders/dto/update-fulfillment.dto';
import * as m31 from './app.controller';
import * as m32 from './bot-settings/bot-settings.controller';
import * as m33 from './menu-items/menu-items.controller';
import * as m34 from './delivery-locations/delivery-locations.controller';
import * as m35 from './delivery-locations/public-delivery-locations.controller';
import * as m36 from './delivery-locations/delivery-areas.controller';
import * as m37 from './whatsapp/webhook.controller';
import * as m38 from './push-subscriptions/push-subscriptions.controller';
import * as m39 from './conversations/conversations.controller';
import * as m40 from './categories/categories.controller';
import * as m41 from './media/media-retention.controller';
import * as m42 from './openapi/docs-page.controller';
import * as m43 from './product-categories/product-categories.controller';
import * as m44 from './product-categories/public-product-categories.controller';
import * as m45 from './products/products.controller';
import * as m46 from './products/public-products.controller';
import * as m47 from './store-settings/store-settings.controller';
import * as m48 from './store-settings/public-store-settings.controller';
import * as m49 from './checkout/public-checkout.controller';
import * as m50 from './site-orders/site-orders.controller';
import * as m51 from './openapi/openapi.controller';

export default async () => {
  const t = {
    ['./checkout/dto/cart-item.dto']: await m0,
  };
  return {
    '@nestjs/swagger': {
      models: [
        [
          m1,
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
          m2,
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
        [m3, { UpdateMenuItemDto: {} }],
        [
          m4,
          {
            ReorderMenuItemsDto: {
              orderedIds: {
                required: true,
                type: () => [String],
                description:
                  'Todos os itens, na ordem nova. O teto \u00E9 folgado: o menu tem poucos itens.',
                format: 'uuid',
                maxItems: 50,
              },
            },
          },
        ],
        [
          m5,
          {
            UpdateDeliveryLocationDto: {
              covered: { required: true, type: () => Boolean },
            },
          },
        ],
        [m6, { CheckCepDto: { cep: { required: false, type: () => String } } }],
        [
          m7,
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
        [m8, { UpdateDeliveryAreaDto: {} }],
        [
          m9,
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
          m10,
          {
            SavePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m11,
          {
            RemovePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m12,
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
          m13,
          {
            ListConversationsDto: {
              q: {
                required: false,
                type: () => String,
                description:
                  'Texto livre, comparado com o nome do contato e com o telefone. No\ntelefone vale qualquer formata\u00E7\u00E3o ("+55 (21) 98444-8130", "98444-8130"):\na busca usa s\u00F3 os d\u00EDgitos.',
              },
              unread: { required: false, type: () => Boolean },
              categoryId: {
                required: false,
                type: () => String,
                format: 'uuid',
              },
            },
          },
        ],
        [
          m14,
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
          m15,
          {
            ReplyDto: {
              text: {
                required: true,
                type: () => String,
                description:
                  'N\u00E3o pode ser vazio: a Cloud API recusa mensagem de texto sem corpo.',
              },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m16,
          {
            ReplyImageDto: {
              caption: { required: false, type: () => String },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m17,
          {
            ReplyAudioDto: {
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m18,
          {
            UpdateConversationDto: {
              name: { required: true, type: () => String },
            },
          },
        ],
        [
          m19,
          {
            ListCategoriesDto: {
              q: {
                required: false,
                type: () => String,
                description: 'Parte do nome, sem diferenciar mai\u00FAsculas.',
                maxLength: 100,
              },
            },
          },
        ],
        [
          m20,
          {
            CreateCategoryDto: {
              name: { required: true, type: () => String },
              color: { required: true, type: () => String },
            },
          },
        ],
        [m21, { UpdateCategoryDto: {} }],
        [
          m0,
          {
            CartItemDto: {
              productId: { required: true, type: () => String, format: 'uuid' },
              quantity: {
                required: true,
                type: () => Number,
                minimum: 1,
                maximum: 20,
              },
            },
          },
        ],
        [
          m22,
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
        [m23, { UpdateProductCategoryDto: {} }],
        [
          m24,
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
        [m25, { UpdateProductDto: {} }],
        [
          m26,
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
          m27,
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
        [
          m28,
          {
            QuoteDto: {
              items: {
                required: true,
                type: () => [t['./checkout/dto/cart-item.dto'].CartItemDto],
                minItems: 1,
                maxItems: 30,
              },
              cep: {
                required: false,
                type: () => String,
                description:
                  'Com ou sem m\u00E1scara; sem CEP, a cota\u00E7\u00E3o diz `no_cep` na entrega.',
                maxLength: 20,
              },
            },
          },
        ],
        [
          m29,
          {
            ListSiteOrdersDto: {
              status: {
                required: false,
                enum: [
                  'pending_payment',
                  'paid',
                  'expired',
                  'cancelled',
                  'refunded',
                ],
              },
              kind: { required: false, enum: ['products', 'tickets'] },
              q: {
                required: false,
                type: () => String,
                description:
                  'C\u00F3digo (`DV-0042`, `42`) ou nome do comprador.',
                maxLength: 100,
              },
            },
          },
        ],
        [
          m30,
          {
            UpdateFulfillmentDto: {
              fulfillmentStatus: {
                required: true,
                enum: ['awaiting', 'preparing', 'ready', 'completed'],
              },
            },
          },
        ],
      ],
      controllers: [
        [m31, { AppController: { health: {} } }],
        [
          m32,
          {
            BotSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m33,
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
          m34,
          {
            DeliveryLocationsController: { list: { type: Object }, update: {} },
          },
        ],
        [
          m35,
          {
            PublicDeliveryLocationsController: {
              listCovered: { type: [Object] },
              check: {
                summary:
                  '"Entregamos no seu CEP?" do site, com a mesma resposta que o bot d\u00E1.\nA CDN da Vercel guarda a resposta por CEP (a URL) por 10 minutos: o\nmesmo CEP n\u00E3o chega \u00E0 fun\u00E7\u00E3o nem \u00E0 BrasilAPI de novo. Mudar a cobertura\nno admin leva at\u00E9 esse tempo pra aparecer aqui (o bot n\u00E3o tem cache).',
                type: Object,
              },
            },
          },
        ],
        [
          m36,
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
        [m37, { WebhookController: { verify: { type: String }, receive: {} } }],
        [m38, { PushSubscriptionsController: { save: {}, remove: {} } }],
        [
          m39,
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
          m40,
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
          m41,
          {
            MediaRetentionController: {
              run: {
                summary:
                  'Ordem dentro do job: **apagar \u2192 reconciliar**. Reconciliar antes\ngravaria um n\u00FAmero que a purga desta mesma execu\u00E7\u00E3o ia invalidar em\nseguida.',
              },
            },
          },
        ],
        [m42, { DocsPageController: { page: { type: String } } }],
        [
          m43,
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
          m44,
          {
            PublicProductCategoriesController: {
              listActive: { type: [Object] },
            },
          },
        ],
        [
          m45,
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
          m46,
          {
            PublicProductsController: {
              listActive: { type: [Object] },
              findBySlug: { type: Object },
            },
          },
        ],
        [
          m47,
          {
            StoreSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m48,
          { PublicStoreSettingsController: { getPublic: { type: Object } } },
        ],
        [
          m49,
          {
            PublicCheckoutController: {
              quote: {
                summary:
                  'Pre\u00E7o, estoque e frete do carrinho, sempre calculados no servidor.',
                type: Object,
              },
              findOrder: {
                summary:
                  'A p\u00E1gina do pedido, pelo token secreto do link (`/pedido/<token>` no site).',
                type: Object,
              },
            },
          },
        ],
        [
          m50,
          {
            SiteOrdersController: {
              list: {},
              findOne: { type: Object },
              updateFulfillment: { type: Object },
              cancel: { type: Object },
            },
          },
        ],
        [m51, { OpenApiController: { get: { type: Object } } }],
      ],
    },
  };
};
