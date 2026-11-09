import {
  availabilityOf,
  availableStock,
  lockProducts,
  reservedQuantities,
  stockLeft,
} from './stock';

type Db = Parameters<typeof availableStock>[0];

function mocks(
  products: { id: string; stock: number | null }[] = [],
  groups: {
    productId: string | null;
    _sum: { quantity: number | null };
  }[] = [],
) {
  const findMany = jest.fn().mockResolvedValue(products);
  const groupBy = jest.fn().mockResolvedValue(groups);
  const queryRaw = jest.fn();
  const db = {
    product: { findMany },
    siteOrderItem: { groupBy },
    $queryRaw: queryRaw,
  } as unknown as Db;
  return { db, groupBy, queryRaw };
}

const now = new Date('2026-11-09T12:00:00Z');

describe('availabilityOf', () => {
  it('maps what is left to the badge the site shows', () => {
    expect(availabilityOf(null)).toBe('made_to_order');
    expect(availabilityOf(3)).toBe('in_stock');
    expect(availabilityOf(0)).toBe('sold_out');
  });
});

describe('stockLeft', () => {
  it('is null for made-to-order products, which have no limit', () => {
    expect(stockLeft(null, 5)).toBeNull();
  });

  it('subtracts the reservations and never goes below zero', () => {
    expect(stockLeft(3, 1)).toBe(2);
    expect(stockLeft(1, 4)).toBe(0);
  });
});

describe('reservedQuantities', () => {
  it('only counts pending orders that have not expired', async () => {
    const { db, groupBy } = mocks(
      [],
      [{ productId: 'p1', _sum: { quantity: 2 } }],
    );

    const result = await reservedQuantities(db, ['p1', 'p2'], now);

    expect(result).toEqual(new Map([['p1', 2]]));
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: { in: ['p1', 'p2'] },
          order: { status: 'pending_payment', expiresAt: { gt: now } },
        },
      }),
    );
  });

  it('does not query when there are no products', async () => {
    const { db, groupBy } = mocks();
    await expect(reservedQuantities(db, [], now)).resolves.toEqual(new Map());
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe('availableStock', () => {
  it('combines stock and reservations per product', async () => {
    const { db } = mocks(
      [
        { id: 'p1', stock: 3 },
        { id: 'p2', stock: null },
        { id: 'p3', stock: 1 },
      ],
      [
        { productId: 'p1', _sum: { quantity: 1 } },
        { productId: 'p3', _sum: { quantity: 1 } },
      ],
    );

    const result = await availableStock(db, ['p1', 'p2', 'p3', 'gone'], now);

    expect(result).toEqual(
      new Map([
        ['p1', 2],
        ['p2', null],
        ['p3', 0],
      ]),
    );
  });
});

describe('lockProducts', () => {
  it('locks the product rows for the rest of the transaction', async () => {
    const { db, queryRaw } = mocks();
    await lockProducts(db, ['p1', 'p2']);

    const [strings, ids] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string[],
    ];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(ids).toEqual(['p1', 'p2']);
  });

  it('does nothing for an empty cart', async () => {
    const { db, queryRaw } = mocks();
    await lockProducts(db, []);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
