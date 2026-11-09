import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Contra o banco de verdade, porque é aqui que o que o mock esconde aparece:
 * a ordem das rotas (`/products/active` não pode cair no `/products/:id` do
 * admin, que responderia 401), o `Decimal` virando número e o filtro de
 * categoria ativa feito pelo Postgres.
 */
describe('Public catalog (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const ids: { categories: string[]; products: string[]; orders: string[] } = {
    categories: [],
    products: [],
    orders: [],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();

    const vasos = await prisma.productCategory.create({
      data: { name: 'E2E Vasos', slug: 'e2e-vasos', description: 'Vasos.' },
    });
    const hidden = await prisma.productCategory.create({
      data: { name: 'E2E Oculta', slug: 'e2e-oculta', active: false },
    });
    const empty = await prisma.productCategory.create({
      data: { name: 'E2E Vazia', slug: 'e2e-vazia' },
    });
    ids.categories.push(vasos.id, hidden.id, empty.id);

    for (const data of [
      {
        name: 'E2E Vaso',
        slug: 'e2e-vaso',
        price: '89.90',
        categoryId: vasos.id,
        featured: true,
        order: 0,
      },
      {
        name: 'E2E Muda',
        slug: 'e2e-muda',
        price: '20',
        categoryId: vasos.id,
        order: 1,
      },
      {
        name: 'E2E Rascunho',
        slug: 'e2e-rascunho',
        price: '10',
        categoryId: vasos.id,
        active: false,
      },
      {
        name: 'E2E Escondido',
        slug: 'e2e-escondido',
        price: '10',
        categoryId: hidden.id,
      },
    ]) {
      const product = await prisma.product.create({
        data: { description: 'd', images: [], ...data },
      });
      ids.products.push(product.id);
    }

    // Estoque: um de cada estado, mais um com a única unidade reservada por
    // um pedido pendente e outro com a reserva já vencida.
    const stockCases = [
      { slug: 'e2e-pronta', stock: 2, leadTimeDays: 9 },
      { slug: 'e2e-esgotado', stock: 0 },
      { slug: 'e2e-encomenda', stock: null, leadTimeDays: 10 },
      { slug: 'e2e-reservado', stock: 1 },
      { slug: 'e2e-reserva-vencida', stock: 1 },
    ];
    for (const { slug, ...stock } of stockCases) {
      const product = await prisma.product.create({
        data: {
          name: slug,
          slug,
          description: 'd',
          price: '10',
          images: [],
          categoryId: vasos.id,
          order: 10,
          ...stock,
        },
      });
      ids.products.push(product.id);
      if (slug === 'e2e-reservado' || slug === 'e2e-reserva-vencida') {
        const minutes = slug === 'e2e-reservado' ? 30 : -30;
        const order = await prisma.siteOrder.create({
          data: {
            customerName: 'E2E',
            customerEmail: 'e2e@exemplo.com',
            customerPhone: '5521999999999',
            deliveryMethod: 'pickup',
            subtotal: '10',
            deliveryFee: '0',
            total: '10',
            expiresAt: new Date(Date.now() + minutes * 60 * 1000),
            items: {
              create: {
                productId: product.id,
                productName: slug,
                unitPrice: '10',
                quantity: 1,
              },
            },
          },
        });
        ids.orders.push(order.id);
      }
    }
  });

  afterAll(async () => {
    await prisma.siteOrder.deleteMany({ where: { id: { in: ids.orders } } });
    await prisma.product.deleteMany({ where: { id: { in: ids.products } } });
    await prisma.productCategory.deleteMany({
      where: { id: { in: ids.categories } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  const e2eOnly = (items: { slug: string }[]) =>
    items.filter((i) => i.slug.startsWith('e2e-'));

  it('GET /product-categories/active lists only active categories with an active product, without auth', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/product-categories/active')
      .expect(200);

    expect(e2eOnly(body)).toEqual([
      {
        id: ids.categories[0],
        name: 'E2E Vasos',
        slug: 'e2e-vasos',
        description: 'Vasos.',
      },
    ]);
  });

  it('GET /products/active?featured=true is public, keeps only featured products and returns price as a number', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/products/active?featured=true')
      .expect(200);

    expect(e2eOnly(body)).toEqual([
      {
        id: ids.products[0],
        name: 'E2E Vaso',
        slug: 'e2e-vaso',
        description: 'd',
        price: 89.9,
        images: [],
        category: {
          id: ids.categories[0],
          name: 'E2E Vasos',
          slug: 'e2e-vasos',
        },
        availability: 'made_to_order',
        leadTimeDays: null,
      },
    ]);
  });

  it('shows in stock, sold out and made to order, counting only reservations that have not expired', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/products/active?category=e2e-vasos')
      .expect(200);

    const products = body as {
      slug: string;
      availability: string;
      leadTimeDays: number | null;
    }[];
    const bySlug = Object.fromEntries(
      products.map((p) => [p.slug, [p.availability, p.leadTimeDays]]),
    );
    expect(bySlug).toMatchObject({
      'e2e-pronta': ['in_stock', null],
      'e2e-esgotado': ['sold_out', null],
      'e2e-encomenda': ['made_to_order', 10],
      'e2e-reservado': ['sold_out', null],
      'e2e-reserva-vencida': ['in_stock', null],
    });
  });

  it('filters by category slug, and an unknown slug is an empty list', async () => {
    const vasos = await request(app.getHttpServer())
      .get('/products/active?category=e2e-vasos')
      .expect(200);
    expect(
      (vasos.body as { slug: string }[])
        .map((p) => p.slug)
        .filter((slug) => ['e2e-vaso', 'e2e-muda'].includes(slug)),
    ).toEqual(['e2e-vaso', 'e2e-muda']);

    await request(app.getHttpServer())
      .get('/products/active?category=nao-existe')
      .expect(200)
      .expect([]);
  });

  it('GET /products/active/:slug finds an active product and 404s the rest', async () => {
    await request(app.getHttpServer())
      .get('/products/active/e2e-vaso')
      .expect(200);
    await request(app.getHttpServer())
      .get('/products/active/e2e-rascunho')
      .expect(404);
    await request(app.getHttpServer())
      .get('/products/active/e2e-escondido')
      .expect(404);
  });

  it('keeps the admin routes behind auth', async () => {
    await request(app.getHttpServer()).get('/products').expect(401);
    await request(app.getHttpServer()).get('/product-categories').expect(401);
  });
});
