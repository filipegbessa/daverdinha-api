/* eslint-disable */
// Gerado por scripts/generate-openapi-metadata.ts — não edite à mão.
import * as m0 from './checkout/dto/cart-item.dto';
import * as m1 from './checkout/dto/customer.dto';
import * as m2 from './checkout/dto/create-checkout.dto';
import * as m3 from './checkout/dto/create-ticket-checkout.dto';
import * as m4 from './bot-settings/dto/update-bot-settings.dto';
import * as m5 from './menu-items/dto/create-menu-item.dto';
import * as m6 from './menu-items/dto/update-menu-item.dto';
import * as m7 from './menu-items/dto/reorder-menu-items.dto';
import * as m8 from './delivery-locations/dto/update-delivery-location.dto';
import * as m9 from './delivery-locations/dto/create-delivery-area.dto';
import * as m10 from './delivery-locations/dto/update-delivery-area.dto';
import * as m11 from './delivery-locations/dto/check-cep.dto';
import * as m12 from './delivery-locations/dto/set-area-locations.dto';
import * as m13 from './push-subscriptions/dto/save-push-subscription.dto';
import * as m14 from './push-subscriptions/dto/remove-push-subscription.dto';
import * as m15 from './common/pagination';
import * as m16 from './conversations/dto/list-conversations.dto';
import * as m17 from './conversations/dto/list-messages.dto';
import * as m18 from './conversations/dto/reply.dto';
import * as m19 from './conversations/dto/reply-image.dto';
import * as m20 from './conversations/dto/reply-audio.dto';
import * as m21 from './conversations/dto/update-conversation.dto';
import * as m22 from './categories/dto/list-categories.dto';
import * as m23 from './categories/dto/create-category.dto';
import * as m24 from './categories/dto/update-category.dto';
import * as m25 from './product-categories/dto/create-product-category.dto';
import * as m26 from './product-categories/dto/update-product-category.dto';
import * as m27 from './products/dto/create-product.dto';
import * as m28 from './products/dto/update-product.dto';
import * as m29 from './products/dto/list-products.dto';
import * as m30 from './store-settings/dto/update-store-settings.dto';
import * as m31 from './checkout/dto/quote.dto';
import * as m32 from './site-orders/dto/list-site-orders.dto';
import * as m33 from './site-orders/dto/update-fulfillment.dto';
import * as m34 from './events/dto/create-event.dto';
import * as m35 from './events/dto/update-event.dto';
import * as m36 from './events/dto/list-events.dto';
import * as m37 from './site-orders/dto/list-attendees.dto';
import * as m38 from './site-orders/dto/check-in.dto';
import * as m39 from './checkout/dto/lookup-orders.dto';
import * as m40 from './site-orders/dto/check-in-by-code.dto';
import * as m41 from './app.controller';
import * as m42 from './bot-settings/bot-settings.controller';
import * as m43 from './menu-items/menu-items.controller';
import * as m44 from './delivery-locations/delivery-locations.controller';
import * as m45 from './delivery-locations/public-delivery-locations.controller';
import * as m46 from './delivery-locations/delivery-areas.controller';
import * as m47 from './whatsapp/webhook.controller';
import * as m48 from './push-subscriptions/push-subscriptions.controller';
import * as m49 from './conversations/conversations.controller';
import * as m50 from './categories/categories.controller';
import * as m51 from './media/media-retention.controller';
import * as m52 from './openapi/docs-page.controller';
import * as m53 from './product-categories/product-categories.controller';
import * as m54 from './product-categories/public-product-categories.controller';
import * as m55 from './products/products.controller';
import * as m56 from './products/public-products.controller';
import * as m57 from './store-settings/store-settings.controller';
import * as m58 from './store-settings/public-store-settings.controller';
import * as m59 from './checkout/public-checkout.controller';
import * as m60 from './site-orders/site-orders.controller';
import * as m61 from './checkout/pagarme-webhook.controller';
import * as m62 from './events/events.controller';
import * as m63 from './events/public-events.controller';
import * as m64 from './site-orders/site-order-tickets.controller';
import * as m65 from './openapi/openapi.controller';

export default async () => {
  const t = {
    ['./checkout/dto/cart-item.dto']: await m0,
    ['./checkout/dto/customer.dto']: await m1,
    ['./checkout/dto/create-checkout.dto']: await m2,
    ['./checkout/dto/create-ticket-checkout.dto']: await m3,
  };
  return {
    '@nestjs/swagger': {
      models: [
        [
          m4,
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
          m5,
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
        [m6, { UpdateMenuItemDto: {} }],
        [
          m7,
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
          m8,
          {
            UpdateDeliveryLocationDto: {
              covered: { required: true, type: () => Boolean },
            },
          },
        ],
        [
          m9,
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
        [m10, { UpdateDeliveryAreaDto: {} }],
        [
          m11,
          { CheckCepDto: { cep: { required: false, type: () => String } } },
        ],
        [
          m12,
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
          m13,
          {
            SavePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m14,
          {
            RemovePushSubscriptionDto: {
              endpoint: { required: true, type: () => String },
            },
          },
        ],
        [
          m15,
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
          m16,
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
          m17,
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
          m18,
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
          m19,
          {
            ReplyImageDto: {
              caption: { required: false, type: () => String },
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m20,
          {
            ReplyAudioDto: {
              replyToMessageId: { required: false, type: () => String },
            },
          },
        ],
        [
          m21,
          {
            UpdateConversationDto: {
              name: {
                required: true,
                type: () => String,
                nullable: true,
                description:
                  'Nome do contato no admin. Vazio (ou s\u00F3 espa\u00E7o) apaga o nome (`null`), e a\nconversa volta a aparecer pelo telefone; com nome, ele \u00E9 o principal e o\ntelefone vira secund\u00E1rio.',
              },
            },
          },
        ],
        [
          m22,
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
          m23,
          {
            CreateCategoryDto: {
              name: { required: true, type: () => String },
              color: { required: true, type: () => String },
            },
          },
        ],
        [m24, { UpdateCategoryDto: {} }],
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
          m1,
          {
            CustomerDto: {
              name: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 100,
              },
              email: {
                required: true,
                type: () => String,
                maxLength: 200,
                format: 'email',
              },
              phone: {
                required: true,
                type: () => String,
                description:
                  'Com ou sem m\u00E1scara e c\u00F3digo do pa\u00EDs: 10 a 13 d\u00EDgitos. Gravado normalizado (`5521\u2026`).',
                maxLength: 30,
                pattern: '^(?:\\D*\\d){10,13}\\D*$',
              },
            },
          },
        ],
        [
          m2,
          {
            AddressDto: {
              cep: {
                required: true,
                type: () => String,
                description: 'Com ou sem m\u00E1scara: 8 d\u00EDgitos.',
                maxLength: 20,
                pattern: '^(?:\\D*\\d){8}\\D*$',
              },
              street: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 200,
              },
              number: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 20,
              },
              complement: {
                required: false,
                type: () => String,
                maxLength: 100,
              },
            },
            CreateCheckoutDto: {
              items: {
                required: true,
                type: () => [t['./checkout/dto/cart-item.dto'].CartItemDto],
                minItems: 1,
                maxItems: 30,
              },
              customer: {
                required: true,
                type: () => t['./checkout/dto/customer.dto'].CustomerDto,
              },
              deliveryMethod: { required: true, enum: ['pickup', 'delivery'] },
              address: {
                required: false,
                type: () => t['./checkout/dto/create-checkout.dto'].AddressDto,
                description:
                  'Obrigat\u00F3rio na entrega; ignorado na retirada.',
              },
              notes: { required: false, type: () => String, maxLength: 500 },
            },
          },
        ],
        [
          m3,
          {
            AttendeeDto: {
              name: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 100,
              },
            },
            CreateTicketCheckoutDto: {
              eventId: { required: true, type: () => String, format: 'uuid' },
              attendees: {
                required: true,
                type: () => [
                  t['./checkout/dto/create-ticket-checkout.dto'].AttendeeDto,
                ],
                description:
                  'Um nome por ingresso. 50 \u00E9 o teto t\u00E9cnico; o limite real \u00E9 o do evento.',
                minItems: 1,
                maxItems: 50,
              },
              customer: {
                required: true,
                type: () => t['./checkout/dto/customer.dto'].CustomerDto,
              },
              notes: { required: false, type: () => String, maxLength: 500 },
            },
          },
        ],
        [
          m25,
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
        [m26, { UpdateProductCategoryDto: {} }],
        [
          m27,
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
        [m28, { UpdateProductDto: {} }],
        [
          m29,
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
          m30,
          {
            UpdateStoreSettingsDto: {
              siteEnabled: {
                required: false,
                type: () => Boolean,
                description:
                  'Site completo em `/` (ligado) ou p\u00E1gina "em breve" (desligado).',
              },
              storeEnabled: {
                required: false,
                type: () => Boolean,
                description:
                  'Venda pelo site. Liga mesmo sem a chave do Pagar.me (o pagamento \u00E9 que n\u00E3o inicia).',
              },
              ticketsEnabled: {
                required: false,
                type: () => Boolean,
                description:
                  'Venda de ingressos pelo site, independente da loja. Tamb\u00E9m liga sem a chave do Pagar.me.',
              },
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
          m31,
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
          m32,
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
              eventId: {
                required: false,
                type: () => String,
                description: 'Pedidos de ingresso de um evento.',
                format: 'uuid',
              },
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
          m33,
          {
            UpdateFulfillmentDto: {
              fulfillmentStatus: {
                required: true,
                enum: ['awaiting', 'preparing', 'ready', 'completed'],
              },
            },
          },
        ],
        [
          m34,
          {
            CreateEventDto: {
              title: { required: true, type: () => String },
              description: { required: true, type: () => String },
              startsAt: {
                required: true,
                type: () => String,
                description: 'ISO 8601 com fuso (o admin manda em UTC).',
              },
              endsAt: {
                required: false,
                type: () => String,
                nullable: true,
                description:
                  'Opcional: sem fim, o evento sai da lista no fim do dia em que come\u00E7a.',
              },
              locationName: {
                required: false,
                type: () => String,
                nullable: true,
              },
              locationAddress: {
                required: false,
                type: () => String,
                nullable: true,
              },
              price: {
                required: false,
                type: () => Number,
                nullable: true,
                minimum: 0,
              },
              spots: {
                required: false,
                type: () => Number,
                nullable: true,
                minimum: 1,
              },
              published: { required: false, type: () => Boolean },
              ticketSales: {
                required: false,
                type: () => Boolean,
                description:
                  'Venda/inscri\u00E7\u00E3o pelo site ("Comprar ingresso" se pago, "Inscrever-se" se\ngratuito). S\u00F3 vale com o interruptor "Venda de ingressos" do Dashboard.',
              },
              maxTicketsPerOrder: {
                required: false,
                type: () => Number,
                description: 'M\u00E1ximo de ingressos numa compra.',
                minimum: 1,
                maximum: 50,
              },
            },
          },
        ],
        [
          m35,
          {
            UpdateEventDto: {
              removeImage: {
                required: false,
                type: () => Boolean,
                description:
                  '`true` apaga a foto atual sem mandar outra (o site volta pro placeholder).',
              },
            },
          },
        ],
        [
          m36,
          {
            ListEventsDto: {
              q: {
                required: false,
                type: () => String,
                description:
                  'Parte do t\u00EDtulo, sem diferenciar mai\u00FAsculas.',
              },
            },
          },
        ],
        [
          m37,
          {
            ListAttendeesDto: {
              q: {
                required: false,
                type: () => String,
                description: 'Parte do nome do participante ou do comprador.',
                maxLength: 100,
              },
            },
          },
        ],
        [
          m38,
          {
            CheckInDto: {
              checkedIn: {
                required: true,
                type: () => Boolean,
                description:
                  '`true` marca a presen\u00E7a agora; `false` desfaz.',
              },
            },
          },
        ],
        [
          m39,
          {
            LookupOrdersDto: {
              email: {
                required: true,
                type: () => String,
                maxLength: 200,
                format: 'email',
              },
            },
          },
        ],
        [
          m40,
          {
            CheckInByCodeDto: {
              eventId: {
                required: true,
                type: () => String,
                description:
                  'O evento da lista de presen\u00E7a aberta: ingresso de outro evento n\u00E3o entra.',
                format: 'uuid',
              },
              code: {
                required: true,
                type: () => String,
                description:
                  'O que o leitor leu ou foi digitado (`K7Q2-M9XP`, com ou sem tra\u00E7o).',
                minLength: 4,
                maxLength: 20,
              },
            },
          },
        ],
      ],
      controllers: [
        [m41, { AppController: { health: {} } }],
        [
          m42,
          {
            BotSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m43,
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
          m44,
          {
            DeliveryLocationsController: { list: { type: Object }, update: {} },
          },
        ],
        [
          m45,
          {
            PublicDeliveryLocationsController: {
              listCovered: { type: [Object] },
              check: {
                summary:
                  '"Entregamos no seu CEP?" do site, com a mesma resposta que o bot d\u00E1.\nA CDN da Vercel guarda a resposta por CEP (a URL) por 10 minutos: o\nmesmo CEP n\u00E3o chega \u00E0 fun\u00E7\u00E3o nem \u00E0 BrasilAPI de novo. Mudar a cobertura\nno admin leva at\u00E9 esse tempo pra aparecer aqui (o bot n\u00E3o tem cache),\ne o mesmo vale pro valor do frete (o checkout n\u00E3o usa este cache).',
                type: Object,
              },
            },
          },
        ],
        [
          m46,
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
        [m47, { WebhookController: { verify: { type: String }, receive: {} } }],
        [m48, { PushSubscriptionsController: { save: {}, remove: {} } }],
        [
          m49,
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
          m50,
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
          m51,
          {
            MediaRetentionController: {
              run: {
                summary:
                  'Ordem dentro do job: **apagar \u2192 reconciliar**. Reconciliar antes\ngravaria um n\u00FAmero que a purga desta mesma execu\u00E7\u00E3o ia invalidar em\nseguida.',
              },
            },
          },
        ],
        [m52, { DocsPageController: { page: { type: String } } }],
        [
          m53,
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
          m54,
          {
            PublicProductCategoriesController: {
              listActive: { type: [Object] },
            },
          },
        ],
        [
          m55,
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
          m56,
          {
            PublicProductsController: {
              listActive: { type: [Object] },
              findBySlug: { type: Object },
            },
          },
        ],
        [
          m57,
          {
            StoreSettingsController: {
              get: { type: Object },
              update: { type: Object },
            },
          },
        ],
        [
          m58,
          { PublicStoreSettingsController: { getPublic: { type: Object } } },
        ],
        [
          m59,
          {
            PublicCheckoutController: {
              quote: {
                summary:
                  'Pre\u00E7o, estoque e frete do carrinho, sempre calculados no servidor.',
                type: Object,
              },
              create: {
                summary:
                  'Cria o pedido e devolve o link de pagamento. 409 = carrinho mudou\n(`problems`), 422 = entrega/retirada indispon\u00EDvel (`reason`), 503 = o\npagamento n\u00E3o p\u00F4de ser iniciado.',
              },
              createTickets: {
                summary:
                  'Compra de ingresso (ou inscri\u00E7\u00E3o gratuita) na p\u00E1gina do evento.\n`paymentUrl: null` = gratuito, j\u00E1 confirmado. 409 com `reason`:\n`tickets_closed`, `not_available`, `sold_out` ou `too_many`.',
              },
              lookupOrders: {
                summary:
                  '"Meus pedidos": manda os links dos pedidos pro e-mail. Responde 202\nigual com ou sem pedido; 429 depois de muitas tentativas.',
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
          m60,
          {
            SiteOrdersController: {
              list: {},
              findOne: { type: Object },
              updateFulfillment: { type: Object },
              cancel: { type: Object },
              resendConfirmation: {
                summary:
                  'Manda de novo o e-mail de confirma\u00E7\u00E3o (s\u00F3 pedido pago). 503 sem e-mail configurado.',
                type: Object,
              },
              sync: {
                summary:
                  'Consulta o Pagar.me agora, sem esperar o intervalo de um minuto.',
                type: Object,
              },
            },
          },
        ],
        [m61, { PagarmeWebhookController: { handle: {} } }],
        [
          m62,
          {
            EventsController: {
              list: {},
              create: { type: Object },
              update: { type: Object },
              remove: {},
            },
          },
        ],
        [
          m63,
          {
            PublicEventsController: {
              listUpcoming: { type: [Object] },
              findBySlug: { type: Object },
            },
          },
        ],
        [
          m64,
          {
            SiteOrderTicketsController: {
              listAttendees: {
                summary:
                  'Participantes de pedidos pagos, com `sold` e `spots` do evento.',
              },
              checkInByCode: {
                summary:
                  'Check-in pelo QR. 404 = c\u00F3digo desconhecido; 409 com `reason`:\n`other_event`, `not_paid` ou `already_checked_in` (com `checkedInAt`).',
                type: Object,
              },
              checkIn: { type: Object },
            },
          },
        ],
        [m65, { OpenApiController: { get: { type: Object } } }],
      ],
    },
  };
};
