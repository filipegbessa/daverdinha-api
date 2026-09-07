import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Prisma schema + seed', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds exactly one bot_settings row', async () => {
    const count = await prisma.botSettings.count();
    expect(count).toBe(1);
  });

  it('seeds 28 delivery locations covering 4 zones', async () => {
    const count = await prisma.deliveryLocation.count();
    expect(count).toBe(28);
    const zonas = await prisma.deliveryLocation.groupBy({ by: ['zone'] });
    expect(zonas.map((z) => z.zone).sort()).toEqual([
      'Centro',
      'Zona Norte',
      'Zona Portuária',
      'Zona Sul',
    ]);
  });

  it('seeds 3 menu items, one of them the system entrega item', async () => {
    const count = await prisma.menuItem.count();
    expect(count).toBe(3);
    const tipos = await prisma.menuItem.groupBy({ by: ['type'] });
    expect(tipos.map((t) => t.type).sort()).toEqual(['entrega', 'texto']);
    const systemCount = await prisma.menuItem.count({
      where: { isSystem: true },
    });
    expect(systemCount).toBe(1);
  });
});
