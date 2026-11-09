import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * A cotação contra o banco de verdade: CEP resolvido pela faixa local (sem
 * BrasilAPI), valor da área, estoque com reserva e preço que nunca vem do
 * corpo da requisição.
 */
describe('Checkout quote (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const zone = 'E2E Checkout';
  const ids = { category: '', ready: '', handmade: '', hidden: '' };
  // Faixa de CEP só deste teste, longe das reais do seed.
  const coveredCep = '99990100';
  const noAreaCep = '99990200';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const category = await prisma.productCategory.create({
      data: { name: 'E2E Checkout', slug: 'e2e-checkout' },
    });
    ids.category = category.id;
    const base = { description: 'd', images: [], categoryId: category.id };
    ids.ready = (
      await prisma.product.create({
        data: {
          ...base,
          name: 'E2E Pronto',
          slug: 'e2e-checkout-pronto',
          price: '19.90',
          stock: 2,
        },
      })
    ).id;
    ids.handmade = (
      await prisma.product.create({
        data: {
          ...base,
          name: 'E2E Encomenda',
          slug: 'e2e-checkout-encomenda',
          price: '50.00',
          stock: null,
          leadTimeDays: 7,
        },
      })
    ).id;
    ids.hidden = (
      await prisma.product.create({
        data: {
          ...base,
          name: 'E2E Oculto',
          slug: 'e2e-checkout-oculto',
          price: '10',
          active: false,
        },
      })
    ).id;

    const area = await prisma.deliveryArea.create({
      data: { zone, name: 'Perto', fee: '12.50' },
    });
    await prisma.deliveryLocation.create({
      data: {
        zone,
        regionName: 'E2E Bairro Com Área',
        covered: true,
        areaId: area.id,
        cepRanges: { create: { startCep: 99990100, endCep: 99990199 } },
      },
    });
    await prisma.deliveryLocation.create({
      data: {
        zone,
        regionName: 'E2E Bairro Sem Área',
        covered: true,
        cepRanges: { create: { startCep: 99990200, endCep: 99990299 } },
      },
    });
  });

  afterAll(async () => {
    await prisma.siteOrder.deleteMany({
      where: { customerEmail: 'e2e-checkout@exemplo.com' },
    });
    await prisma.product.deleteMany({ where: { categoryId: ids.category } });
    await prisma.productCategory.delete({ where: { id: ids.category } });
    await prisma.deliveryLocation.deleteMany({ where: { zone } });
    await prisma.deliveryArea.deleteMany({ where: { zone } });
    await app.close();
  });

  const quote = (body: object) =>
    request(app.getHttpServer()).post('/checkout/quote').send(body);

  it('prices from the database, charges the area fee and is public', async () => {
    const { body } = await quote({
      items: [
        { productId: ids.ready, quantity: 2, unitPrice: 0.01 },
        { productId: ids.handmade, quantity: 1 },
      ],
      cep: '99990-150',
    }).expect(200);

    expect(body).toMatchObject({
      items: [
        {
          productId: ids.ready,
          unitPrice: 19.9,
          lineTotal: 39.8,
          availability: 'in_stock',
        },
        {
          productId: ids.handmade,
          unitPrice: 50,
          availability: 'made_to_order',
          leadTimeDays: 7,
        },
      ],
      subtotal: 89.8,
      delivery: {
        available: true,
        fee: 12.5,
        bairro: 'E2E Bairro Com Área',
        area: 'Perto',
      },
      problems: [],
    });
  });

  it('never charges zero for a covered bairro without an area', async () => {
    const { body } = await quote({
      items: [{ productId: ids.handmade, quantity: 1 }],
      cep: noAreaCep,
    }).expect(200);

    expect(body.delivery).toEqual({
      available: false,
      reason: 'no_area',
      bairro: 'E2E Bairro Sem Área',
    });
  });

  it('counts a pending order against the stock and reports what is left', async () => {
    const order = await prisma.siteOrder.create({
      data: {
        customerName: 'E2E',
        customerEmail: 'e2e-checkout@exemplo.com',
        customerPhone: '5521999999999',
        deliveryMethod: 'pickup',
        subtotal: '19.90',
        deliveryFee: '0',
        total: '19.90',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        items: {
          create: {
            productId: ids.ready,
            productName: 'E2E Pronto',
            unitPrice: '19.90',
            quantity: 1,
          },
        },
      },
    });

    const { body } = await quote({
      items: [
        { productId: ids.ready, quantity: 2 },
        { productId: ids.hidden, quantity: 1 },
      ],
      cep: coveredCep,
    }).expect(200);

    expect(body.problems).toEqual([
      { productId: ids.ready, reason: 'insufficient_stock', available: 1 },
      { productId: ids.hidden, reason: 'inactive' },
    ]);
    await prisma.siteOrder.delete({ where: { id: order.id } });
  });

  it('rejects an empty cart, a bad quantity and a malformed id with 400', async () => {
    await quote({ items: [] }).expect(400);
    await quote({ items: [{ productId: ids.ready, quantity: 0 }] }).expect(400);
    await quote({ items: [{ productId: ids.ready, quantity: 21 }] }).expect(
      400,
    );
    await quote({ items: [{ productId: 'abc', quantity: 1 }] }).expect(400);
  });
});
