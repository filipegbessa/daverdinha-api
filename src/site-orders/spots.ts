import { Prisma } from '@prisma/client';

/** Cliente do Prisma ou transação: as funções servem dentro e fora de `$transaction`. */
type Db = Pick<Prisma.TransactionClient, 'siteOrderTicket' | '$queryRaw'>;

/** Ingressos de um evento: pagos (`sold`) e de pedidos pendentes que ainda não venceram (`reserved`). */
export interface TakenSpots {
  sold: number;
  reserved: number;
}

const NONE: TakenSpots = { sold: 0, reserved: 0 };

/**
 * Vagas ocupadas por evento, numa consulta agrupada só (sem N+1 na lista da
 * agenda). Diferente do estoque, a lotação (`Event.spots`) nunca é
 * decrementada: ocupado sai daqui, então cancelar, estornar ou deixar vencer
 * libera a vaga sem mexer em número nenhum.
 */
export async function takenSpots(
  db: Db,
  eventIds: string[],
  now: Date,
): Promise<Map<string, TakenSpots>> {
  if (eventIds.length === 0) return new Map();
  const [sold, reserved] = await Promise.all([
    db.siteOrderTicket.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds }, order: { status: 'paid' } },
      _count: { _all: true },
    }),
    db.siteOrderTicket.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        order: { status: 'pending_payment', expiresAt: { gt: now } },
      },
      _count: { _all: true },
    }),
  ]);
  const taken = new Map<string, TakenSpots>();
  for (const id of eventIds) taken.set(id, { ...NONE });
  for (const g of sold) taken.get(g.eventId)!.sold = g._count._all;
  for (const g of reserved) taken.get(g.eventId)!.reserved = g._count._all;
  return taken;
}

/** `null` = sem limite. Nunca negativo: lotação reduzida abaixo do ocupado dá 0. */
export function spotsLeft(
  spots: number | null,
  taken: TakenSpots = NONE,
): number | null {
  return spots === null
    ? null
    : Math.max(0, spots - taken.sold - taken.reserved);
}

/**
 * Trava a linha do evento até o fim da transação, pra duas compras
 * simultâneas pela última vaga não lerem o mesmo disponível.
 */
export async function lockEvent(db: Db, eventId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
}
