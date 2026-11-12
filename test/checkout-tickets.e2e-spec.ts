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
 * `POST /checkout/tickets` contra o banco de verdade, com o Pagar.me falso: a
 * trava no evento tem que impedir duas vendas da última vaga, o gratuito
 * nasce confirmado, e o interruptor do Dashboard fecha tudo.
 */
describe('Checkout tickets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = 'e2e-checkout-tickets@exemplo.com';
  const ids = { paid: '', free: '' };
  let ticketsWereEnabled = false;
  let linkCount = 0;
  const gateway: PaymentGateway = {
    createCheckout: () => {
      linkCount += 1;
      return Promise.resolve({
        gatewayLinkId: `pl_e2e_tickets_${Date.now()}_${linkCount}`,
        paymentUrl: `https://checkout.example/t${linkCount}`,
      });
    },
    getCharge: () => Promise.reject(new Error('not used')),
    findChargesForLink: () => Promise.resolve([]),
  };

  const setTicketsEnabled = (ticketsEnabled: boolean) =>
    prisma.storeSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        ticketsEnabled,
        pickupAddress: 'R. Capiberibe, 32',
        pickupHours: 'Combinar pelo WhatsApp',
      },
      update: { ticketsEnabled },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const before = await prisma.storeSettings.findUnique({ where: { id: 1 } });
    ticketsWereEnabled = before?.ticketsEnabled ?? false;
    await setTicketsEnabled(true);

    const day = 24 * 60 * 60 * 1000;
    const base = {
      description: 'E2E.',
      startsAt: new Date(Date.now() + day),
      endsAt: new Date(Date.now() + day + 2 * 60 * 60 * 1000),
      published: true,
      ticketSales: true,
    };
    ids.paid = (
      await prisma.event.create({
        data: {
          ...base,
          title: 'E2E Ingresso pago',
          slug: 'e2e-ingresso-pago',
          price: '45.00',
          spots: 1,
        },
      })
    ).id;
    ids.free = (
      await prisma.event.create({
        data: { ...base, title: 'E2E Gratuito', slug: 'e2e-ingresso-gratuito' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.siteOrder.deleteMany({ where: { customerEmail: email } });
    await prisma.event.deleteMany({
      where: { id: { in: [ids.paid, ids.free] } },
    });
    await setTicketsEnabled(ticketsWereEnabled);
    await app.close();
  });

  const buy = (eventId: string, names = ['E2E Participante']) =>
    request(app.getHttpServer())
      .post('/checkout/tickets')
      .send({
        eventId,
        attendees: names.map((name) => ({ name })),
        customer: { name: 'E2E Comprador', email, phone: '(21) 99999-8888' },
      });

  it('sells the last spot only once when two purchases race for it', async () => {
    const results = await Promise.all([buy(ids.paid), buy(ids.paid)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 201)!.body.paymentUrl).toContain(
      'https://checkout.example/',
    );
    expect(results.find((r) => r.status === 409)!.body).toMatchObject({
      reason: 'sold_out',
      spotsLeft: 0,
    });

    const { body } = await request(app.getHttpServer())
      .get('/events/e2e-ingresso-pago')
      .expect(200);
    expect(body).toMatchObject({
      ticketSales: true,
      spotsLeft: 0,
      soldOut: true,
    });
  });

  it('confirms a free sign-up right away and lists it as an attendee', async () => {
    const res = await buy(ids.free, ['E2E Ana', 'E2E Beto']).expect(201);

    expect(res.body.paymentUrl).toBeNull();
    const order = await request(app.getHttpServer())
      .get(`/checkout/orders/${res.body.token}`)
      .expect(200);
    expect(order.body).toMatchObject({
      kind: 'tickets',
      status: 'paid',
      deliveryMethod: null,
      event: { slug: 'e2e-ingresso-gratuito' },
    });
    expect(order.body.tickets).toHaveLength(2);
    // Cada participante tem o código do QR, diferente um do outro.
    const codes = (order.body.tickets as { code: string }[]).map((t) => t.code);
    expect(new Set(codes).size).toBe(2);
    codes.forEach((code) => expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/));
    // A lista de presença é do admin.
    await request(app.getHttpServer())
      .get(`/events/${ids.free}/attendees`)
      .expect(401);
  });

  it('closes every sale while the Dashboard switch is off', async () => {
    await setTicketsEnabled(false);
    try {
      const res = await buy(ids.free).expect(409);
      expect(res.body.reason).toBe('tickets_closed');
      const { body } = await request(app.getHttpServer())
        .get('/events/e2e-ingresso-gratuito')
        .expect(200);
      expect(body.ticketSales).toBe(false);
    } finally {
      await setTicketsEnabled(true);
    }
  });

  it('answers "Meus pedidos" the same way with or without orders', async () => {
    const withOrders = await request(app.getHttpServer())
      .post('/checkout/orders/lookup')
      .set('x-forwarded-for', '203.0.113.7')
      .send({ email })
      .expect(202);
    const without = await request(app.getHttpServer())
      .post('/checkout/orders/lookup')
      .set('x-forwarded-for', '203.0.113.7')
      .send({ email: 'ninguem-e2e@exemplo.com' })
      .expect(202);
    expect(withOrders.body).toEqual(without.body);
    await prisma.lookupAttempt.deleteMany({
      where: {
        key: {
          in: [
            `email:${email}`,
            'email:ninguem-e2e@exemplo.com',
            'ip:203.0.113.7',
          ],
        },
      },
    });
  });
});
