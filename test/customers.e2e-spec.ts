import { PrismaClient, type SiteOrderStatus } from '@prisma/client';
import { CustomersService } from '../src/customers/customers.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Contra o banco de verdade: a lista de clientes é SQL escrito à mão
 * (agrupar por e-mail sem diferença de maiúscula, nome do pedido mais
 * recente), e o mock não diria se ele roda no Postgres.
 */
describe('Customers (e2e)', () => {
  const prisma = new PrismaClient();
  const service = new CustomersService(prisma as unknown as PrismaService);
  const ids: { orders: string[]; conversations: string[] } = {
    orders: [],
    conversations: [],
  };

  async function order(
    email: string,
    name: string,
    total: string,
    status: SiteOrderStatus,
    createdAt: string,
    phone = '5521988801234',
  ) {
    const row = await prisma.siteOrder.create({
      data: {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        deliveryMethod: 'pickup',
        subtotal: total,
        deliveryFee: '0',
        total,
        status,
        createdAt: new Date(createdAt),
        expiresAt: new Date(createdAt),
      },
    });
    ids.orders.push(row.id);
  }

  beforeAll(async () => {
    await order(
      'e2e-cli-ana@exemplo.com',
      'Ana',
      '100',
      'paid',
      '2026-01-01T10:00:00Z',
    );
    // Mesmo e-mail em maiúscula, nome novo: conta junto, e o nome é o mais recente.
    await order(
      'E2E-CLI-ANA@exemplo.com',
      'Ana Souza',
      '50.50',
      'paid',
      '2026-02-01T10:00:00Z',
    );
    // Não pago: não conta.
    await order(
      'e2e-cli-ana@exemplo.com',
      'Ana',
      '999',
      'pending_payment',
      '2026-03-01T10:00:00Z',
    );
    await order(
      'e2e-cli-bia@exemplo.com',
      'Bia',
      '300',
      'paid',
      '2026-01-15T10:00:00Z',
      '5521955504321',
    );

    const conversation = await prisma.conversation.create({
      // A conversa sem o nono dígito, como o WhatsApp manda alguns números.
      data: { phone: '552188801234', name: 'Ana WhatsApp' },
    });
    ids.conversations.push(conversation.id);
  });

  afterAll(async () => {
    await prisma.siteOrder.deleteMany({ where: { id: { in: ids.orders } } });
    await prisma.conversation.deleteMany({
      where: { id: { in: ids.conversations } },
    });
    await prisma.$disconnect();
  });

  it('groups paid orders by email, with the latest name and the conversation', async () => {
    const { items, total } = await service.list({ q: 'e2e-cli-' });

    expect(total).toBe(2);
    expect(items).toEqual([
      {
        name: 'Ana Souza',
        email: 'E2E-CLI-ANA@exemplo.com',
        phone: '5521988801234',
        ordersCount: 2,
        totalSpent: 150.5,
        lastOrderAt: '2026-02-01T10:00:00.000Z',
        conversationId: ids.conversations[0],
      },
      expect.objectContaining({
        name: 'Bia',
        totalSpent: 300,
        conversationId: null,
      }),
    ]);
  });

  it('sorts by total spent and finds by phone digits', async () => {
    const bySpent = await service.list({ q: 'e2e-cli-', sort: 'spent' });
    expect(bySpent.items.map((c) => c.name)).toEqual(['Bia', 'Ana Souza']);

    const byPhone = await service.list({ q: '95550-4321' });
    expect(byPhone.items.map((c) => c.name)).toEqual(['Bia']);
  });

  it('treats % in the search as text', async () => {
    const { total } = await service.list({ q: '%' });
    expect(total).toBe(0);
  });

  it('finds the customer of a conversation phone without the ninth digit', async () => {
    const result = await service.byPhone('552188801234');

    expect(result.customer).toEqual(
      expect.objectContaining({
        name: 'Ana Souza',
        ordersCount: 2,
        totalSpent: 150.5,
      }),
    );
    expect(result.recentOrders.map((o) => o.status)).toEqual([
      'pending_payment',
      'paid',
      'paid',
    ]);
    expect(result.conversationId).toBe(ids.conversations[0]);
  });
});
