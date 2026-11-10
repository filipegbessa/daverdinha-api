// prisma/seed.ts
import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeText } from '../src/common/normalize-text';

const prisma = new PrismaClient();

interface BairroRow {
  regiao: string;
  bairro: string;
}

interface CepRangeRow {
  bairro: string;
  ranges: { start: number; end: number }[];
}

async function seedDeliveryLocations() {
  const bairros: BairroRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'rj-bairros.json'), 'utf-8'),
  );
  const rangesByBairro: CepRangeRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'cep-ranges.json'), 'utf-8'),
  );

  const existing = await prisma.deliveryLocation.findMany();
  const coveredByLegacyName = new Map(
    existing.map((loc) => [normalizeText(loc.regionName), loc.covered]),
  );

  for (const { regiao, bairro } of bairros) {
    const location = await prisma.deliveryLocation.upsert({
      where: { regionName: bairro },
      // De propósito, a exceção ao `update: {}` do resto do seed: a zona vem
      // do arquivo oficial e o admin não a edita (só liga e desliga
      // `covered`), então reaplicar mantém a zona em dia com o arquivo sem
      // desfazer nada que a dona tenha mexido. `covered` nunca é tocado aqui.
      update: { zone: regiao },
      create: {
        zone: regiao,
        regionName: bairro,
        covered: coveredByLegacyName.get(normalizeText(bairro)) ?? false,
      },
    });

    const hasRanges =
      (await prisma.cepRange.count({
        where: { deliveryLocationId: location.id },
      })) > 0;
    if (hasRanges) continue; // ranges already seeded for this bairro — never duplicate them

    const rangeRow = rangesByBairro.find(
      (r) => normalizeText(r.bairro) === normalizeText(bairro),
    );
    if (!rangeRow) continue;
    for (const range of rangeRow.ranges) {
      await prisma.cepRange.create({
        data: {
          startCep: range.start,
          endCep: range.end,
          deliveryLocationId: location.id,
        },
      });
    }
  }
}

const CATEGORIES = [
  { name: 'Dúvida', color: '#F59E0B' },
  { name: 'Reclamação', color: '#EF4444' },
  { name: 'Elogio', color: '#22C55E' },
  { name: 'Pedido', color: '#3B82F6' },
];

async function seedCategories() {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }
}

/**
 * Catálogo de exemplo pra desenvolver o site e o admin localmente. Mesmos
 * produtos de `src/features/site/data/samples.ts` no `daverdinha`, então a
 * vitrine local fica igual à prévia. Sem fotos: elas moram no Vercel Blob,
 * e o site mostra o placeholder. Os destaques são 6 de propósito, mais do
 * que cabe numa linha, pra vitrine da home virar carrossel. O estoque cobre
 * os três estados do site: pronta entrega (`stock` com número), esgotado
 * (`stock: 0`) e sob encomenda (`stock: null` com prazo de confecção).
 */
const PRODUCT_CATEGORIES = [
  {
    name: 'Vasos',
    slug: 'vasos',
    description:
      'Vasos de cerâmica, terracota e cimento pintados à mão no ateliê, do tamanho de uma suculenta ao de uma costela-de-adão.',
  },
  {
    name: 'Mudas',
    slug: 'mudas',
    description:
      'Mudas saudáveis, aclimatadas no ateliê e prontas pra ir pra casa, com dica de cuidado na entrega.',
  },
  {
    name: 'Arranjos',
    slug: 'arranjos',
    description:
      'Arranjos montados sob medida pra presente, mesa posta ou um canto da casa que pede verde.',
  },
  {
    name: 'Kits',
    slug: 'kits',
    description:
      'Tudo o que precisa pra montar o seu: vaso, substrato, planta e o passo a passo.',
  },
];

const PRODUCTS = [
  {
    name: 'Vaso Terracota M',
    slug: 'vaso-terracota-m',
    stock: 5,
    leadTimeDays: null,
    category: 'vasos',
    price: '89.90',
    featured: true,
    description:
      'Vaso de terracota de 18 cm, com furo de drenagem e prato. A terracota respira e ajuda a raiz a não encharcar — bom pra quem rega demais.',
  },
  {
    name: 'Vaso Pintado Folhagem',
    slug: 'vaso-pintado-folhagem',
    stock: 1,
    leadTimeDays: null,
    category: 'vasos',
    price: '119.00',
    featured: true,
    description:
      'Cerâmica de 14 cm pintada à mão no ateliê. Cada peça sai um pouco diferente da outra.',
  },
  {
    name: 'Jiboia em cuia',
    slug: 'jiboia-em-cuia',
    stock: 8,
    leadTimeDays: null,
    category: 'mudas',
    price: '59.00',
    featured: true,
    description:
      'Jiboia já enraizada numa cuia de coco. Gosta de luz indireta e rega quando a terra secar.',
  },
  {
    name: 'Suculenta Echeveria',
    slug: 'suculenta-echeveria',
    stock: 0,
    leadTimeDays: null,
    category: 'mudas',
    price: '32.00',
    featured: false,
    description: 'Echeveria em vaso de 8 cm. Sol pela manhã e pouca água.',
  },
  {
    name: 'Arranjo Tropical',
    slug: 'arranjo-tropical',
    stock: null,
    leadTimeDays: 3,
    category: 'arranjos',
    price: '159.00',
    featured: true,
    description:
      'Folhagens tropicais num cachepô de palha, montado no dia da entrega.',
  },
  {
    name: 'Kit Terrário Pequeno',
    slug: 'kit-terrario-pequeno',
    stock: null,
    leadTimeDays: 10,
    category: 'kits',
    price: '129.00',
    featured: true,
    description:
      'Pote de vidro, pedrisco, carvão, substrato, duas mudas e o passo a passo pra montar em casa.',
  },
  {
    name: 'Kit Kokedama',
    slug: 'kit-kokedama',
    stock: null,
    leadTimeDays: 7,
    category: 'kits',
    price: '89.00',
    featured: true,
    description:
      'Musgo, substrato, barbante e uma muda pra fazer sua kokedama.',
  },
  {
    name: 'Arranjo de Mesa',
    slug: 'arranjo-de-mesa',
    stock: null,
    leadTimeDays: 5,
    category: 'arranjos',
    price: '99.00',
    featured: false,
    description: 'Arranjo baixo pra centro de mesa, com suculentas e musgo.',
  },
];

async function seedCatalog() {
  // `update: {}` em tudo: rodar o seed de novo nunca desfaz o que foi
  // editado no admin, só recria o que foi apagado.
  const categoryIds = new Map<string, string>();
  for (const [order, category] of PRODUCT_CATEGORIES.entries()) {
    const row = await prisma.productCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, order },
    });
    categoryIds.set(category.slug, row.id);
  }

  for (const [order, { category, ...product }] of PRODUCTS.entries()) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: {
        ...product,
        order,
        images: [],
        categoryId: categoryIds.get(category)!,
      },
    });
  }
}

/** Mesmo endereço de `daverdinha/src/data/business.ts`. */
const STORE_SETTINGS = {
  pickupAddress:
    'R. Capiberibe, 32 - Santo Cristo, Rio de Janeiro - RJ, 20220-030',
  pickupHours: 'Seg a sex, 10h às 18h · Sáb, 10h às 14h',
};

async function seedStoreSettings() {
  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...STORE_SETTINGS },
  });
}

/**
 * Duas áreas por zona ("Perto" e "Longe"), com os bairros da zona divididos
 * entre elas em ordem alfabética. O último bairro de cada zona fica sem área,
 * pra testar entrega indisponível. Só preenche bairros ainda sem área: rodar
 * de novo não desfaz o que foi arrumado no admin.
 */
const DELIVERY_AREAS = [
  { name: 'Perto', fee: '15.00' },
  { name: 'Longe', fee: '30.00' },
];

async function seedDeliveryAreas() {
  const locations = await prisma.deliveryLocation.findMany({
    orderBy: { regionName: 'asc' },
  });
  const zones = [...new Set(locations.map((l) => l.zone))];

  for (const zone of zones) {
    const [near, far] = await Promise.all(
      DELIVERY_AREAS.map((area) =>
        prisma.deliveryArea.upsert({
          where: { zone_name: { zone, name: area.name } },
          update: {},
          create: { zone, ...area },
        }),
      ),
    );
    const inZone = locations.filter((l) => l.zone === zone).slice(0, -1);
    const half = Math.ceil(inZone.length / 2);
    for (const [index, location] of inZone.entries()) {
      if (location.areaId) continue;
      await prisma.deliveryLocation.update({
        where: { id: location.id },
        data: { areaId: index < half ? near.id : far.id },
      });
    }
  }
}

interface SeedSiteOrderItem {
  slug: string;
  quantity: number;
}

interface SeedSiteOrder {
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  status: 'paid' | 'pending_payment';
  fulfillmentStatus: 'awaiting' | 'preparing';
  delivery: boolean;
  items: SeedSiteOrderItem[];
}

/** Identificados pelo e-mail `@exemplo.com`, que nunca é de cliente real. */
const SITE_ORDERS: SeedSiteOrder[] = [
  {
    customerEmail: 'maria@exemplo.com',
    customerName: 'Maria Souza',
    customerPhone: '5521999990101',
    status: 'paid',
    fulfillmentStatus: 'awaiting',
    delivery: true,
    items: [
      { slug: 'vaso-terracota-m', quantity: 1 },
      { slug: 'kit-kokedama', quantity: 1 },
    ],
  },
  {
    customerEmail: 'joao@exemplo.com',
    customerName: 'João Lima',
    customerPhone: '5521999990102',
    status: 'paid',
    fulfillmentStatus: 'preparing',
    delivery: false,
    items: [{ slug: 'arranjo-tropical', quantity: 1 }],
  },
  {
    customerEmail: 'ana@exemplo.com',
    customerName: 'Ana Rocha',
    customerPhone: '5521999990103',
    status: 'pending_payment',
    fulfillmentStatus: 'awaiting',
    delivery: false,
    items: [{ slug: 'jiboia-em-cuia', quantity: 2 }],
  },
];

async function seedSiteOrders() {
  const deliveryLocation = await prisma.deliveryLocation.findFirst({
    where: { areaId: { not: null } },
    include: { area: true },
    orderBy: { regionName: 'asc' },
  });
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (const order of SITE_ORDERS) {
    const existing = await prisma.siteOrder.findFirst({
      where: { customerEmail: order.customerEmail },
    });
    if (existing) continue;

    const products = await prisma.product.findMany({
      where: { slug: { in: order.items.map((i) => i.slug) } },
    });
    const items = order.items.flatMap(({ slug, quantity }) => {
      const product = products.find((p) => p.slug === slug);
      if (!product) return []; // apagado no admin: o exemplo segue sem ele
      return [
        {
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          imageUrl: product.images[0] ?? null,
          unitPrice: product.price,
          quantity,
          leadTimeDays: product.stock === null ? product.leadTimeDays : null,
        },
      ];
    });
    if (items.length === 0) continue;

    const subtotal = items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const area = order.delivery ? deliveryLocation?.area : null;
    const deliveryFee = area?.fee ?? new Prisma.Decimal(0);

    await prisma.siteOrder.create({
      data: {
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryMethod: area ? 'delivery' : 'pickup',
        ...(area &&
          deliveryLocation && {
            cep: '20220030',
            street: 'Rua de Exemplo',
            streetNumber: '100',
            bairro: deliveryLocation.regionName,
            deliveryZone: area.zone,
            deliveryArea: area.name,
          }),
        subtotal,
        deliveryFee,
        total: subtotal.add(deliveryFee),
        paidAt: order.status === 'paid' ? hourAgo : null,
        // Pendente já vencido: aparece como "vencido" assim que alguém lê.
        expiresAt: hourAgo,
        items: { create: items },
      },
    });
  }
}

interface SeedMessage {
  direction: 'inbound' | 'outbound';
  body: string;
  whatsappMessageId?: string;
  repliedToWamid?: string;
}

interface SeedConversation {
  phone: string;
  name: string;
  status: 'bot_active' | 'paused_human';
  entryPoint: 'menu' | 'catalog';
  unread: boolean;
  categories: string[];
  messages: SeedMessage[];
}

const CONVERSATIONS: SeedConversation[] = [
  {
    phone: '5521999990001',
    name: 'Marina Silva',
    status: 'bot_active',
    entryPoint: 'menu',
    unread: true,
    categories: ['Dúvida'],
    messages: [
      {
        direction: 'inbound',
        body: 'Oi, vocês entregam no Leblon?',
        whatsappMessageId: 'wamid.seed.marina.1',
      },
      {
        direction: 'outbound',
        body: 'Oi! Que bom te ver por aqui 🌱 Bem-vinda(o) à Daverdinha — um espaço pra plantar, criar e brindar. Como posso te ajudar hoje?',
        whatsappMessageId: 'wamid.seed.marina.2',
      },
      {
        direction: 'inbound',
        body: 'Queria saber se entregam no meu bairro',
        whatsappMessageId: 'wamid.seed.marina.3',
      },
      {
        direction: 'outbound',
        body: 'Sim! entregamos aí no Leblon, aguarde um pouco que entro em contato',
        whatsappMessageId: 'wamid.seed.1',
      },
      {
        direction: 'inbound',
        body: 'Perfeito, obrigada!',
        whatsappMessageId: 'wamid.seed.marina.4',
        repliedToWamid: 'wamid.seed.1',
      },
    ],
  },
  {
    phone: '5521999990002',
    name: 'João Pedro',
    status: 'paused_human',
    entryPoint: 'catalog',
    unread: true,
    categories: ['Reclamação'],
    messages: [
      {
        direction: 'inbound',
        body: 'Meu pedido chegou com a planta quebrada',
        whatsappMessageId: 'wamid.seed.joao.1',
      },
      {
        direction: 'outbound',
        body: 'Poxa, sinto muito! Vou te chamar um atendente pra resolver isso.',
        whatsappMessageId: 'wamid.seed.joao.2',
      },
    ],
  },
  {
    phone: '5521999990003',
    name: 'Ana Costa',
    status: 'bot_active',
    entryPoint: 'menu',
    unread: false,
    categories: ['Elogio', 'Pedido'],
    messages: [
      {
        direction: 'inbound',
        body: 'Adorei o atendimento, muito obrigada!',
        whatsappMessageId: 'wamid.seed.ana.1',
      },
      {
        direction: 'outbound',
        body: 'Fico muito feliz em ouvir isso! 🌱',
        whatsappMessageId: 'wamid.seed.ana.2',
      },
      {
        direction: 'inbound',
        body: 'Queria fazer outro pedido',
        whatsappMessageId: 'wamid.seed.ana.3',
      },
    ],
  },
];

async function seedConversations() {
  const categoriesByName = new Map(
    (await prisma.category.findMany()).map((c) => [c.name, c.id]),
  );

  for (const seedConversation of CONVERSATIONS) {
    const existing = await prisma.conversation.findFirst({
      where: { phone: seedConversation.phone },
    });
    if (existing) continue; // never duplicate on a re-run against a non-empty db

    const conversation = await prisma.conversation.create({
      data: {
        phone: seedConversation.phone,
        name: seedConversation.name,
        status: seedConversation.status,
        entryPoint: seedConversation.entryPoint,
        unread: seedConversation.unread,
      },
    });

    // Track messages by whatsappMessageId to resolve citations within this run
    const messagesByWamid = new Map<string, string>();

    for (const message of seedConversation.messages) {
      let repliedToId: string | undefined;

      // If this message replies to another, look up the repliedToId
      if (
        message.repliedToWamid &&
        messagesByWamid.has(message.repliedToWamid)
      ) {
        repliedToId = messagesByWamid.get(message.repliedToWamid);
      }

      const createdMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: message.direction,
          body: message.body,
          whatsappMessageId: message.whatsappMessageId,
          repliedToWamid: message.repliedToWamid,
          repliedToId,
        },
      });

      // Track this message if it has a whatsappMessageId
      if (message.whatsappMessageId) {
        messagesByWamid.set(message.whatsappMessageId, createdMessage.id);
      }
    }

    for (const categoryName of seedConversation.categories) {
      const categoryId = categoriesByName.get(categoryName);
      if (!categoryId) continue;
      await prisma.conversationCategory.create({
        data: { conversationId: conversation.id, categoryId },
      });
    }
  }
}

/**
 * Um pedido do catálogo do WhatsApp na conversa do João (que entrou pelo
 * catálogo), pra a tela de pedido na thread aparecer no ambiente local.
 * Chave natural: o `whatsappMessageId` da mensagem e o `messageId` do pedido
 * (único); `update: {}` nos dois, então rodar de novo não duplica nem
 * sobrescreve. Os itens nascem junto com o pedido.
 */
const WHATSAPP_ORDER = {
  phone: '5521999990002',
  whatsappMessageId: 'wamid.seed.joao.order',
  catalogId: 'seed-catalog',
  items: [
    {
      productRetailerId: 'vaso-ceramica-m',
      productName: 'Vaso de cerâmica M',
      quantity: 2,
      unitPrice: '35.00',
      currency: 'BRL',
    },
    {
      productRetailerId: 'terrario-pequeno',
      productName: 'Terrário pequeno',
      quantity: 1,
      unitPrice: '89.90',
      currency: 'BRL',
    },
  ],
};

async function seedWhatsAppOrder() {
  const conversation = await prisma.conversation.findFirst({
    where: { phone: WHATSAPP_ORDER.phone },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  if (!conversation) return;

  // Um dia antes da primeira mensagem: o pedido abre a conversa, e a
  // reclamação que já está no seed vem depois dele.
  const firstAt = conversation.messages[0]?.createdAt ?? new Date();
  const message = await prisma.message.upsert({
    where: { whatsappMessageId: WHATSAPP_ORDER.whatsappMessageId },
    update: {},
    create: {
      conversationId: conversation.id,
      direction: 'inbound',
      kind: 'order',
      body: null,
      whatsappMessageId: WHATSAPP_ORDER.whatsappMessageId,
      createdAt: new Date(firstAt.getTime() - 24 * 60 * 60 * 1000),
    },
  });

  await prisma.order.upsert({
    where: { messageId: message.id },
    update: {},
    create: {
      conversationId: conversation.id,
      messageId: message.id,
      catalogId: WHATSAPP_ORDER.catalogId,
      items: { create: WHATSAPP_ORDER.items },
    },
  });
}

async function main() {
  await prisma.botSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      botEnabled: false,
      welcomeMessage:
        'Oi! Que bom te ver por aqui 🌱 Bem-vinda(o) à Daverdinha — um espaço pra plantar, criar e brindar. Como posso te ajudar hoje?',
      invalidAttemptsExceededMessage:
        'Não consegui entender sua opção, vou te chamar um atendente!',
      mediaReceivedMessage: 'Esse tipo de mensagem não é válido por aqui!',
      orderReceivedMessage:
        'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
    },
  });

  await seedDeliveryLocations();
  await seedCategories();
  await seedConversations();
  await seedWhatsAppOrder();
  await seedCatalog();
  await seedStoreSettings();
  await seedDeliveryAreas();
  await seedSiteOrders();

  const menuItems = [
    {
      order: 0,
      topic: 'Locais de entrega',
      isSystem: true,
      reply: null,
      deliveryPrompt: 'Qual o CEP para entrega?',
      deliveryConfirmedMessage:
        'Sim! entregamos aí no [local], aguarde um pouco que entro em contato',
      deliveryNotCoveredMessage:
        'Infelizmente ainda não fazemos entregas no [local]',
      deliveryRetryMessage: 'Esse não é um CEP válido, quer tentar novamente?',
      deliveryUnrecognizedMessage:
        'Não consegui identificar seu CEP, vou te chamar um atendente!',
      active: true,
    },
    {
      order: 1,
      topic: 'Bingo de Plantas',
      isSystem: false,
      reply: 'Todo sábado às 16h, aqui na loja!',
      active: true,
    },
    {
      order: 2,
      topic: 'Falar com um atendente',
      isSystem: false,
      reply: 'Aguarde um pouco que já retorno',
      active: true,
    },
  ];

  for (const item of menuItems) {
    // No unique constraint on topic (it's admin-editable), so this can't be
    // a real upsert. Match on the item's natural key instead, and only
    // create when missing — never overwrite an existing row, since the
    // admin may have already customized its reply/messages.
    const where = item.isSystem ? { isSystem: true } : { topic: item.topic };
    const existing = await prisma.menuItem.findFirst({ where });
    if (!existing) {
      await prisma.menuItem.create({ data: item });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
