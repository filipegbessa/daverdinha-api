import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toMoney } from '../common/money';
import { StoreSettingsService } from '../store-settings/store-settings.service';

/** Vendas de um período: pedidos pagos com valor e a soma deles. */
export interface SalesPeriod {
  orders: number;
  revenue: number;
}

/** O que o Dashboard mostra no topo: vendas, o que preparar e o estoque baixo. */
export interface SalesSummary {
  today: SalesPeriod;
  last7Days: SalesPeriod;
  last30Days: SalesPeriod;
  /** Valor médio dos pedidos pagos nos últimos 30 dias; `null` sem venda. */
  averageTicket30Days: number | null;
  /** Pedidos de produtos pagos ainda não prontos (aguardando ou em preparo). */
  toPrepare: number;
  /** Pedidos prontos, esperando a retirada ou a entrega. */
  readyToDeliver: number;
  /** Os 5 produtos com mais unidades vendidas nos últimos 30 dias. */
  topProducts: { name: string; quantity: number }[];
  /** Pronta entrega com `threshold` unidades ou menos (0 = esgotado). */
  lowStock: {
    threshold: number;
    products: { id: string; name: string; stock: number }[];
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * O Rio está em UTC−3 o ano todo (sem horário de verão desde 2019): o "hoje"
 * da cliente começa à meia-noite daqui, não à meia-noite UTC.
 */
const RIO_OFFSET_MS = 3 * 60 * 60 * 1000;

export function startOfRioDay(now: Date): Date {
  const local = now.getTime() - RIO_OFFSET_MS;
  return new Date(local - (local % DAY_MS) + RIO_OFFSET_MS);
}

/** Quantos produtos com estoque baixo o Dashboard lista. */
const LOW_STOCK_LIMIT = 10;

@Injectable()
export class SalesSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeSettings: StoreSettingsService,
  ) {}

  /**
   * Conta só pedido pago e com valor: inscrição gratuita não é venda, e
   * pedido estornado ou cancelado sai da conta (o status deixa de ser
   * `paid`). A data é a do pagamento, não a da criação.
   */
  async summary(now: Date = new Date()): Promise<SalesSummary> {
    const today = startOfRioDay(now);
    const since7 = new Date(today.getTime() - 6 * DAY_MS);
    const since30 = new Date(today.getTime() - 29 * DAY_MS);
    const paidSince30: Prisma.SiteOrderWhereInput = {
      status: 'paid',
      paidAt: { gte: since30 },
      total: { gt: 0 },
    };

    const [orders, toPrepare, readyToDeliver, top, settings] =
      await Promise.all([
        this.prisma.siteOrder.findMany({
          where: paidSince30,
          select: { total: true, paidAt: true },
        }),
        this.prisma.siteOrder.count({
          where: {
            status: 'paid',
            kind: 'products',
            fulfillmentStatus: { in: ['awaiting', 'preparing'] },
          },
        }),
        this.prisma.siteOrder.count({
          where: {
            status: 'paid',
            kind: 'products',
            fulfillmentStatus: 'ready',
          },
        }),
        this.prisma.siteOrderItem.groupBy({
          by: ['productName'],
          where: { order: paidSince30 },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
        this.storeSettings.get(),
      ]);

    const period = (since: Date): SalesPeriod => {
      const inPeriod = orders.filter((o) => o.paidAt && o.paidAt >= since);
      return {
        orders: inPeriod.length,
        revenue: toMoney(
          inPeriod.reduce((sum, o) => sum.plus(o.total), new Prisma.Decimal(0)),
        ),
      };
    };
    const last30Days = period(since30);

    const threshold = settings.lowStockThreshold;
    const lowStock = await this.prisma.product.findMany({
      where: {
        archivedAt: null,
        active: true,
        stock: { not: null, lte: threshold },
      },
      select: { id: true, name: true, stock: true },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: LOW_STOCK_LIMIT,
    });

    return {
      today: period(today),
      last7Days: period(since7),
      last30Days,
      averageTicket30Days:
        last30Days.orders > 0
          ? Math.round((last30Days.revenue / last30Days.orders) * 100) / 100
          : null,
      toPrepare,
      readyToDeliver,
      topProducts: top.map((row) => ({
        name: row.productName,
        quantity: row._sum.quantity ?? 0,
      })),
      lowStock: {
        threshold,
        products: lowStock.map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock ?? 0,
        })),
      },
    };
  }
}
