import { Prisma } from '@prisma/client';

/** Cliente do Prisma ou transação: as funções servem dentro e fora de `$transaction`. */
type Db = Pick<
  Prisma.TransactionClient,
  'product' | 'siteOrderItem' | '$queryRaw'
>;

/** O que o site mostra: selo "Pronta entrega", "Sob encomenda" ou "Esgotado". */
export type Availability = 'in_stock' | 'made_to_order' | 'sold_out';

export function availabilityOf(stockLeft: number | null): Availability {
  if (stockLeft === null) return 'made_to_order';
  return stockLeft > 0 ? 'in_stock' : 'sold_out';
}

/**
 * Disponível = estoque menos o que está reservado. `null` = sob encomenda,
 * sem limite. Nunca negativo: estoque reduzido no admin abaixo do reservado
 * só deixa o produto esgotado.
 */
export function stockLeft(
  stock: number | null,
  reserved: number,
): number | null {
  return stock === null ? null : Math.max(0, stock - reserved);
}

/**
 * Quantidade reservada por produto: itens de pedidos pendentes que ainda não
 * venceram. Pedido pago já baixou do `stock`, e vencido/cancelado não segura
 * nada — por isso a reserva some sozinha, sem cron.
 */
export async function reservedQuantities(
  db: Db,
  productIds: string[],
  now: Date,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const groups = await db.siteOrderItem.groupBy({
    by: ['productId'],
    where: {
      productId: { in: productIds },
      order: { status: 'pending_payment', expiresAt: { gt: now } },
    },
    _sum: { quantity: true },
  });
  return new Map(
    groups.flatMap((g) =>
      g.productId ? [[g.productId, g._sum.quantity ?? 0] as const] : [],
    ),
  );
}

/** Disponível por produto; produto que não existe fica fora do mapa. */
export async function availableStock(
  db: Db,
  productIds: string[],
  now: Date,
): Promise<Map<string, number | null>> {
  if (productIds.length === 0) return new Map();
  const [products, reserved] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true },
    }),
    reservedQuantities(db, productIds, now),
  ]);
  return new Map(
    products.map((p) => [p.id, stockLeft(p.stock, reserved.get(p.id) ?? 0)]),
  );
}

/**
 * Trava as linhas dos produtos até o fim da transação, pra dois checkouts
 * simultâneos pela última unidade não lerem o mesmo disponível. Chamar no
 * começo da transação que cria o pedido, antes de `availableStock`.
 */
export async function lockProducts(
  db: Db,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await db.$queryRaw`SELECT id FROM products WHERE id = ANY(${productIds}::text[]) FOR UPDATE`;
}
