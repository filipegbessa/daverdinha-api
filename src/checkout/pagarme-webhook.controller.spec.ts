import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import {
  extractChargeId,
  PagarmeWebhookController,
} from './pagarme-webhook.controller';
import { SiteOrdersService } from '../site-orders/site-orders.service';
import { PAYMENT_GATEWAY } from '../pagarme/payment-gateway';

const auth = `Basic ${Buffer.from('hook:s3cr3t').toString('base64')}`;

describe('PagarmeWebhookController', () => {
  const env = { ...process.env };
  let controller: PagarmeWebhookController;
  let orders: { applyGatewayCharge: jest.Mock };
  let gateway: { getCharge: jest.Mock };
  const pendingCharge = {
    id: 'ch_1',
    orderId: 'or_1',
    orderCode: 'DV-0042',
    status: 'pending',
    amountCents: 0,
    paidAt: null,
    rawStatus: 'pending',
  };

  beforeEach(async () => {
    process.env.PAGARME_WEBHOOK_USER = 'hook';
    process.env.PAGARME_WEBHOOK_PASSWORD = 's3cr3t';
    orders = { applyGatewayCharge: jest.fn() };
    gateway = { getCharge: jest.fn().mockResolvedValue(pendingCharge) };
    const moduleRef = await Test.createTestingModule({
      controllers: [PagarmeWebhookController],
      providers: [
        { provide: SiteOrdersService, useValue: orders },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
      ],
    }).compile();
    controller = moduleRef.get(PagarmeWebhookController);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('refuses a request without the configured credentials and never calls the gateway', async () => {
    await expect(
      controller.handle(
        { type: 'charge.paid', data: { id: 'ch_1' } },
        'Basic x',
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(gateway.getCharge).not.toHaveBeenCalled();
  });

  it('trusts the status read from the gateway, not the one in the body', async () => {
    await controller.handle(
      { type: 'charge.paid', data: { id: 'ch_1', status: 'paid' } },
      auth,
    );

    expect(gateway.getCharge).toHaveBeenCalledWith('ch_1');
    expect(orders.applyGatewayCharge).toHaveBeenCalledWith(pendingCharge);
  });

  it('answers 200 and ignores events without a charge', async () => {
    await expect(
      controller.handle({ type: 'checkout.canceled', data: {} }, auth),
    ).resolves.toBeUndefined();
    expect(gateway.getCharge).not.toHaveBeenCalled();
  });

  it('lets a gateway error through, so Pagar.me sends the notice again', async () => {
    gateway.getCharge.mockRejectedValue(new Error('down'));

    await expect(
      controller.handle({ type: 'charge.paid', data: { id: 'ch_1' } }, auth),
    ).rejects.toThrow('down');
  });
});

describe('extractChargeId', () => {
  it.each([
    [{ type: 'charge.paid', data: { id: 'ch_1' } }, 'ch_1'],
    [{ event: 'charge.refunded', data: { id: 'ch_2' } }, 'ch_2'],
    [
      {
        type: 'order.paid',
        data: { id: 'or_1', charges: [{ id: 'ch_old' }, { id: 'ch_3' }] },
      },
      'ch_3',
    ],
    [{ type: 'chargeback.received', data: { charge: { id: 'ch_4' } } }, 'ch_4'],
    [{ type: 'checkout.canceled', data: { id: 'pl_1' } }, null],
    [{ type: 'order.paid', data: { id: 'or_1' } }, null],
    [{}, null],
    [null, null],
  ])('reads %j as %s', (body, expected) => {
    expect(extractChargeId(body)).toBe(expected);
  });
});
