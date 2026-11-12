import { Prisma } from '@prisma/client';
import { orderConfirmationEmail } from './order-confirmation';
import { orderLinksEmail } from './order-links';
import { escapeHtml, formatEventDate } from './layout';
import type { SiteOrderRow } from '../../site-orders/site-order-views';

const pickup = {
  pickupAddress: 'R. Capiberibe, 32',
  pickupHours: 'Seg a sex, 10h às 18h',
  pickupInstructions: null,
};

function order(overrides: Record<string, unknown> = {}): SiteOrderRow {
  return {
    number: 42,
    publicToken: 'tok',
    kind: 'products',
    customerName: 'Maria <b>Souza</b>',
    customerEmail: 'maria@exemplo.com',
    deliveryMethod: 'pickup',
    bairro: null,
    deliveryFee: new Prisma.Decimal('0'),
    total: new Prisma.Decimal('59.80'),
    items: [
      {
        productName: 'Vaso M',
        quantity: 2,
        unitPrice: new Prisma.Decimal('29.90'),
        leadTimeDays: 10,
      },
    ],
    tickets: [],
    event: null,
    ...overrides,
  } as unknown as SiteOrderRow;
}

describe('email templates', () => {
  it('confirms a product order with the items, the pickup and the link, and escapes names', async () => {
    const email = await orderConfirmationEmail(order(), pickup, 'https://site');

    expect(email.subject).toBe('Pedido DV-0042 confirmado · Daverdinha');
    expect(email.html).toContain('Oi, Maria');
    expect(email.html).not.toContain('<b>Souza</b>');
    expect(email.html).toContain('2 × Vaso M');
    expect(email.html).toContain('Sob encomenda · até 10 dias');
    expect(email.html).toContain('R. Capiberibe, 32');
    expect(email.html).toContain('https://site/pedido/tok');
    expect(email.text).toContain('Total: R$ 59,80');
    expect(email.images).toBeUndefined();
  });

  it('confirms tickets with one inline QR per attendee and no payment details', async () => {
    const email = await orderConfirmationEmail(
      order({
        kind: 'tickets',
        deliveryMethod: null,
        items: [],
        total: new Prisma.Decimal('0'),
        event: {
          title: 'Feirinha',
          startsAt: new Date('2026-11-21T12:00:00Z'),
          endsAt: null,
          locationName: 'Praça da Harmonia',
          locationAddress: 'Gamboa',
        },
        tickets: [
          { attendeeName: 'Maria', code: 'K7Q2-M9XP' },
          { attendeeName: 'Bruno', code: 'A2B3-C4D5' },
        ],
      }),
      pickup,
      'https://site',
    );

    expect(email.subject).toBe('Inscrição confirmada! Feirinha · DV-0042');
    expect(email.images?.map((i) => i.contentId)).toEqual([
      'ingresso-1',
      'ingresso-2',
    ]);
    expect(email.images?.[0].content.subarray(1, 4).toString()).toBe('PNG');
    expect(email.html).toContain('cid:ingresso-2');
    expect(email.html).toContain('Praça da Harmonia · Gamboa');
    expect(email.text).toContain('- Bruno: A2B3-C4D5');
  });

  it('lists the order links', () => {
    const email = orderLinksEmail(
      'maria@exemplo.com',
      [
        {
          number: 43,
          publicToken: 'tok9',
          kind: 'tickets',
          status: 'pending_payment',
          total: new Prisma.Decimal('90'),
          createdAt: new Date('2026-11-12T12:00:00Z'),
          eventTitle: 'Oficina',
        },
      ],
      'https://site',
    );

    expect(email.text).toContain(
      'DV-0043 · 12/11/2026 · Ingressos · Oficina · aguardando pagamento',
    );
    expect(email.html).toContain('https://site/pedido/tok9');
  });

  it('formats event dates in Rio time, with or without an end', () => {
    const start = new Date('2026-11-21T13:00:00Z');
    expect(formatEventDate(start, new Date('2026-11-21T15:30:00Z'))).toBe(
      'sábado, 21/11 · 10h às 12h30',
    );
    expect(formatEventDate(start, null)).toBe('sábado, 21/11 · 10h');
    expect(escapeHtml(`<a href="x">'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;',
    );
  });
});
