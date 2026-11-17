import { Injectable } from '@nestjs/common';
import { Prisma, SiteOrderKind, SiteOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageBounds, paginated } from '../common/pagination';
import { toMoney } from '../common/money';
import { normalizePhone } from '../common/format-phone';
import { formatOrderCode } from '../site-orders/order-code';
import { ListCustomersDto, type CustomerSort } from './dto/list-customers.dto';
import { phoneVariants } from './phone-variants';

/** Uma linha da lista de clientes. */
export interface CustomerListItem {
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string;
  /** A conversa do WhatsApp com o mesmo telefone, se houver. */
  conversationId: string | null;
}

export interface CustomerOrderSummary {
  id: string;
  code: string;
  kind: SiteOrderKind;
  status: SiteOrderStatus;
  total: number;
  createdAt: string;
}

/** O que a conversa e o pedido mostram da cliente do mesmo telefone. */
export interface CustomerByPhone {
  /** `null` quando o telefone nunca teve pedido pago. */
  customer: Omit<CustomerListItem, 'conversationId' | 'phone'> | null;
  /** Os últimos pedidos, de qualquer status menos vencido. */
  recentOrders: CustomerOrderSummary[];
  conversationId: string | null;
}

interface CustomerRow {
  name: string;
  email: string;
  phone: string;
  orders: number;
  spent: Prisma.Decimal;
  last_order_at: Date;
}

const RECENT_ORDERS = 5;

const ORDER_BY: Record<CustomerSort, Prisma.Sql> = {
  recent: Prisma.sql`last_order_at DESC`,
  spent: Prisma.sql`spent DESC, last_order_at DESC`,
  orders: Prisma.sql`orders DESC, last_order_at DESC`,
};

/** `%` e `_` digitados na busca são texto, não curinga do LIKE. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Clientes da loja, tirados dos pedidos pagos (produtos e ingressos), sem
 * conta nem tabela própria: a compradora é o e-mail (sem diferença de
 * maiúscula). Nome e telefone são os do pedido mais recente. A LGPD não
 * muda: é só outra forma de ver o que os pedidos já guardam.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCustomersDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const customers = Prisma.sql`
      WITH paid AS (
        SELECT lower(customer_email) AS key, customer_name, customer_email,
               customer_phone, total, created_at
        FROM site_orders WHERE status = 'paid'
      ),
      agg AS (
        SELECT key, count(*)::int AS orders, sum(total) AS spent,
               max(created_at) AS last_order_at
        FROM paid GROUP BY key
      ),
      latest AS (
        SELECT DISTINCT ON (key) key, customer_name AS name,
               customer_email AS email, customer_phone AS phone
        FROM paid ORDER BY key, created_at DESC
      )
      SELECT l.name, l.email, l.phone, a.orders, a.spent, a.last_order_at
      FROM agg a JOIN latest l USING (key)`;
    const where = this.searchFilter(query.q);

    const [rows, [{ count }]] = await Promise.all([
      this.prisma.$queryRaw<CustomerRow[]>`
        SELECT * FROM (${customers}) c ${where}
        ORDER BY ${ORDER_BY[query.sort ?? 'recent']}
        LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM (${customers}) c ${where}`,
    ]);

    const conversations = await this.conversationsByPhone(
      rows.map((r) => r.phone),
    );
    const items: CustomerListItem[] = rows.map((r) => ({
      name: r.name,
      email: r.email,
      phone: r.phone,
      ordersCount: r.orders,
      totalSpent: toMoney(r.spent),
      lastOrderAt: r.last_order_at.toISOString(),
      conversationId: conversations.get(r.phone) ?? null,
    }));
    return paginated(items, count, page, perPage);
  }

  /**
   * A cliente por trás de um telefone (o da conversa ou o do pedido),
   * aceitando o número com ou sem o nono dígito.
   */
  async byPhone(rawPhone: string): Promise<CustomerByPhone> {
    const phone = normalizePhone(rawPhone);
    if (!phone)
      return { customer: null, recentOrders: [], conversationId: null };
    const phones = phoneVariants(phone);
    const paidWhere = {
      customerPhone: { in: phones },
      status: 'paid' as const,
    };

    const [stats, latestPaid, recent, conversations] = await Promise.all([
      this.prisma.siteOrder.aggregate({
        where: paidWhere,
        _count: { _all: true },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      this.prisma.siteOrder.findFirst({
        where: paidWhere,
        orderBy: { createdAt: 'desc' },
        select: { customerName: true, customerEmail: true },
      }),
      this.prisma.siteOrder.findMany({
        where: { customerPhone: { in: phones }, status: { not: 'expired' } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_ORDERS,
        select: {
          id: true,
          number: true,
          kind: true,
          status: true,
          total: true,
          createdAt: true,
        },
      }),
      this.conversationsByPhone([phone]),
    ]);

    return {
      customer:
        latestPaid && stats._max.createdAt
          ? {
              name: latestPaid.customerName,
              email: latestPaid.customerEmail,
              ordersCount: stats._count._all,
              totalSpent: toMoney(stats._sum.total ?? new Prisma.Decimal(0)),
              lastOrderAt: stats._max.createdAt.toISOString(),
            }
          : null,
      recentOrders: recent.map((o) => ({
        id: o.id,
        code: formatOrderCode(o.number),
        kind: o.kind,
        status: o.status,
        total: toMoney(o.total),
        createdAt: o.createdAt.toISOString(),
      })),
      conversationId: conversations.get(phone) ?? null,
    };
  }

  /** Nome ou e-mail; com 4 dígitos ou mais, também o telefone. */
  private searchFilter(q: string | undefined): Prisma.Sql {
    const search = q?.trim();
    if (!search) return Prisma.empty;
    const pattern = likePattern(search);
    const digits = search.replace(/\D/g, '');
    const byPhone =
      digits.length >= 4
        ? Prisma.sql` OR c.phone LIKE ${likePattern(digits)}`
        : Prisma.empty;
    return Prisma.sql`WHERE (c.name ILIKE ${pattern} OR c.email ILIKE ${pattern}${byPhone})`;
  }

  /**
   * A conversa de cada telefone (com e sem o nono dígito). Se houver mais de
   * uma, fica a de atividade mais recente.
   */
  private async conversationsByPhone(
    phones: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (phones.length === 0) return result;
    const variantsOf = new Map(phones.map((p) => [p, phoneVariants(p)]));
    const rows = await this.prisma.conversation.findMany({
      where: { phone: { in: [...new Set([...variantsOf.values()].flat())] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, phone: true },
    });
    for (const [phone, variants] of variantsOf) {
      const match = rows.find((r) => variants.includes(r.phone));
      if (match) result.set(phone, match.id);
    }
    return result;
  }
}
