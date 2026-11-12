import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../src/pagarme/payment-gateway';

/**
 * `POST /checkout` contra o banco de verdade, com o Pagar.me trocado por um
 * gateway falso: a trava nos produtos tem que impedir duas vendas da última
 * unidade, e o preço nunca vem do corpo.
 */
describe('Checkout create (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = 'e2e-checkout-create@exemplo.com';
  const ids = { category: '', lastOne: '' };
  let linkCount = 0;
  let storeWasEnabled = false;
  const gateway: PaymentGateway = {
    createCheckout: () => {
      linkCount += 1;
      return Promise.resolve({
        gatewayLinkId: `pl_e2e_${Date.now()}_${linkCount}`,
        paymentUrl: `https://checkout.example/${linkCount}`,
      });
    },
    getCharge: () => Promise.reject(new Error('not used')),
    findChargesForLink: () => Promise.resolve([]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    // A loja precisa estar ligada pro checkout aceitar pedido; volta ao que era no fim.
    const before = await prisma.storeSettings.findUnique({ where: { id: 1 } });
    storeWasEnabled = before?.storeEnabled ?? false;
    await prisma.storeSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        storeEnabled: true,
        pickupEnabled: true,
        pickupAddress: 'R. Capiberibe, 32',
        pickupHours: 'Combinar pelo WhatsApp',
      },
      update: { storeEnabled: true },
    });

    ids.category = (
      await prisma.productCategory.create({
        data: { name: 'E2E Checkout Create', slug: 'e2e-checkout-create' },
      })
    ).id;
    ids.lastOne = (
      await prisma.product.create({
        data: {
          name: 'E2E Última',
          slug: 'e2e-checkout-create-ultima',
          description: 'd',
          images: [],
          categoryId: ids.category,
          price: '19.90',
          stock: 1,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.siteOrder.deleteMany({ where: { customerEmail: email } });
    await prisma.product.deleteMany({ where: { categoryId: ids.category } });
    await prisma.productCategory.delete({ where: { id: ids.category } });
    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { storeEnabled: storeWasEnabled },
    });
    await app.close();
  });

  const checkout = (body: object) =>
    request(app.getHttpServer()).post('/checkout').send(body);

  const pickupOrder = {
    items: [{ productId: '', quantity: 1, unitPrice: 0.01 }],
    customer: { name: 'E2E Comprador', email, phone: '(21) 99999-8888' },
    deliveryMethod: 'pickup',
  };

  it('sells the last unit only once when two checkouts race for it', async () => {
    const body = {
      ...pickupOrder,
      items: [{ productId: ids.lastOne, quantity: 1 }],
    };

    const results = await Promise.all([checkout(body), checkout(body)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const created = results.find((r) => r.status === 201)!.body;
    expect(created).toEqual({
      code: expect.stringMatching(/^DV-\d{4,}$/),
      token: expect.any(String),
      paymentUrl: expect.stringContaining('https://checkout.example/'),
    });
    const conflict = results.find((r) => r.status === 409)!.body;
    expect(conflict.problems).toEqual([
      { productId: ids.lastOne, reason: 'insufficient_stock', available: 0 },
    ]);

    const order = await prisma.siteOrder.findUniqueOrThrow({
      where: { publicToken: created.token },
    });
    // Preço do banco, não o `unitPrice` que o corpo tentou mandar.
    expect(order.total.toString()).toBe('19.9');
    expect(order.customerPhone).toBe('5521999998888');
    expect(order.gatewayLinkId).toMatch(/^pl_e2e_/);
  });

  it('requires the address for delivery and validates the buyer', async () => {
    await checkout({
      ...pickupOrder,
      items: [{ productId: ids.lastOne, quantity: 1 }],
      deliveryMethod: 'delivery',
    }).expect(400);
    await checkout({
      ...pickupOrder,
      items: [{ productId: ids.lastOne, quantity: 1 }],
      customer: { name: 'E', email: 'not-an-email', phone: '123' },
    }).expect(400);
  });
});
