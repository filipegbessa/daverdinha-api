import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PagarmeError,
  PagarmeService,
  splitPhone,
  toGatewayCharge,
} from './pagarme.service';
import type { CheckoutInput } from './payment-gateway';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('PagarmeService', () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;
  let service: PagarmeService;

  beforeEach(() => {
    process.env.PAGARME_SECRET_KEY = 'sk_test_abc';
    process.env.PAGARME_API_URL = 'https://sdx-api.pagar.me/core/v5';
    process.env.SITE_URL = 'https://www.daverdinha.com.br';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new PagarmeService();
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
    jest.useRealTimers();
  });

  function input(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
    return {
      orderId: 'o1',
      code: 'DV-0042',
      items: [
        {
          id: 'p1',
          description: 'Vaso M',
          quantity: 3,
          unitPrice: new Prisma.Decimal('19.90'),
        },
      ],
      deliveryFee: new Prisma.Decimal('12.50'),
      customer: {
        name: 'Maria Souza',
        email: 'maria@exemplo.com',
        phone: '5521999998888',
      },
      successUrl: 'https://www.daverdinha.com.br/pedido/tok',
      maxInstallments: 2,
      expiresAt: new Date('2026-11-12T13:00:00Z'),
      ...overrides,
    };
  }

  describe('createCheckout', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-12T12:00:00Z'));
      fetchMock.mockResolvedValue(
        jsonResponse({ id: 'pl_123', url: 'https://checkout.pagar.me/pl_123' }),
      );
    });

    it('creates a payment link with the secret key and returns its id and url', async () => {
      const result = await service.createCheckout(input());

      expect(result).toEqual({
        gatewayLinkId: 'pl_123',
        paymentUrl: 'https://checkout.pagar.me/pl_123',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sdx-api.pagar.me/core/v5/paymentlinks');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('sk_test_abc:').toString('base64')}`,
      );
      expect(init.headers['User-Agent']).toBeTruthy();
    });

    it('sends prices in cents, the fee as shipping and both deadlines aligned with the order', async () => {
      await service.createCheckout(input());

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual(
        expect.objectContaining({
          type: 'order',
          name: 'Pedido DV-0042',
          order_code: 'DV-0042',
          expires_in: 60,
          max_paid_sessions: 1,
        }),
      );
      expect(body.payment_settings.accepted_payment_methods).toEqual([
        'credit_card',
        'pix',
      ]);
      expect(body.payment_settings.statement_descriptor).toBe('DAVERDINHA');
      expect(body.payment_settings.pix_settings).toEqual({ expires_in: 3600 });
      expect(body.cart_settings).toEqual({
        items: [{ name: 'Vaso M', amount: 1990, default_quantity: 3 }],
        shipping_cost: 1250,
      });
      expect(body.flow_settings).toEqual({
        success_url: 'https://www.daverdinha.com.br/pedido/tok',
      });
      expect(body.layout_settings).toEqual({
        image_url: 'https://www.daverdinha.com.br/logo-circle.png',
      });
    });

    it('offers the installments interest-free, over the full total', async () => {
      await service.createCheckout(input());

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(
        body.payment_settings.credit_card_settings.installments_setup,
      ).toEqual(
        expect.objectContaining({
          max_installments: 2,
          free_installments: 2,
          amount: 5970 + 1250,
        }),
      );
    });

    it('leaves the shipping out of a pickup order and splits the phone', async () => {
      await service.createCheckout(
        input({ deliveryFee: new Prisma.Decimal(0) }),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.cart_settings.shipping_cost).toBeUndefined();
      expect(body.customer_settings.customer).toEqual({
        code: 'o1',
        name: 'Maria Souza',
        email: 'maria@exemplo.com',
        type: 'individual',
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code: '21',
            number: '999998888',
          },
        },
      });
    });

    it('fails with a 503 when the secret key is not configured, without calling out', async () => {
      delete process.env.PAGARME_SECRET_KEY;

      await expect(service.createCheckout(input())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('turns an error answer into an exception and never logs the key', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ message: 'The request is invalid.' }, 422),
      );

      await expect(service.createCheckout(input())).rejects.toBeInstanceOf(
        PagarmeError,
      );
      const logged = (service['logger'].error as jest.Mock).mock.calls
        .flat()
        .join(' ');
      expect(logged).toContain('The request is invalid.');
      expect(logged).not.toContain('sk_test_abc');
    });
  });

  describe('getCharge', () => {
    it('reads the charge and normalizes it', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          id: 'ch_1',
          status: 'paid',
          amount: 7220,
          paid_amount: 7220,
          paid_at: '2026-11-12T12:10:00Z',
          order: { id: 'or_1', code: 'DV-0042' },
        }),
      );

      const charge = await service.getCharge('ch_1');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://sdx-api.pagar.me/core/v5/charges/ch_1',
      );
      expect(charge).toEqual({
        id: 'ch_1',
        orderId: 'or_1',
        orderCode: 'DV-0042',
        status: 'paid',
        amountCents: 7220,
        paidAt: '2026-11-12T12:10:00Z',
        rawStatus: 'paid',
      });
    });

    it('uses the production API when no URL is configured', async () => {
      delete process.env.PAGARME_API_URL;
      fetchMock.mockResolvedValue(jsonResponse({ id: 'ch_1', status: 'paid' }));

      await service.getCharge('ch_1');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.pagar.me/core/v5/charges/ch_1',
      );
    });
  });

  describe('findChargesForLink', () => {
    it('finds the order by our code and returns its charges', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: 'or_1',
              code: 'DV-0042',
              charges: [
                { id: 'ch_1', status: 'failed' },
                { id: 'ch_2', status: 'paid', paid_amount: 7220 },
              ],
            },
          ],
        }),
      );

      const charges = await service.findChargesForLink('pl_123', 'DV-0042');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://sdx-api.pagar.me/core/v5/orders?code=DV-0042',
      );
      expect(charges.map((c) => [c.id, c.status, c.orderId])).toEqual([
        ['ch_1', 'failed', 'or_1'],
        ['ch_2', 'paid', 'or_1'],
      ]);
      expect(charges[1].orderCode).toBe('DV-0042');
    });

    it('is empty while nobody has paid', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

      expect(await service.findChargesForLink('pl_123', 'DV-0042')).toEqual([]);
    });
  });
});

describe('toGatewayCharge', () => {
  it.each([
    ['pending', null, 'pending'],
    ['processing', null, 'pending'],
    ['paid', '2026-11-12T12:00:00Z', 'paid'],
    ['overpaid', '2026-11-12T12:00:00Z', 'paid'],
    ['failed', null, 'failed'],
    ['canceled', null, 'canceled'],
    ['canceled', '2026-11-12T12:00:00Z', 'refunded'],
    ['chargedback', '2026-11-12T12:00:00Z', 'chargedback'],
    ['something_new', null, 'pending'],
  ])('maps %s (paid_at %s) to %s', (status, paidAt, expected) => {
    expect(
      toGatewayCharge({ id: 'ch_1', status, paid_at: paidAt }).status,
    ).toBe(expected);
  });

  it('falls back to the charge code when the order is not embedded', () => {
    expect(
      toGatewayCharge({ id: 'ch_1', status: 'paid', code: 'DV-0042' })
        .orderCode,
    ).toBe('DV-0042');
  });
});

describe('splitPhone', () => {
  it('splits a stored phone into country, area and number', () => {
    expect(splitPhone('5521999998888')).toEqual({
      country_code: '55',
      area_code: '21',
      number: '999998888',
    });
  });
});
