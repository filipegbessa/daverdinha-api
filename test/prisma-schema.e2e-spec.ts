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
    const zonas = await prisma.deliveryLocation.groupBy({ by: ['zona'] });
    expect(zonas.map((z) => z.zona).sort()).toEqual(['Centro', 'Zona Norte', 'Zona Portuária', 'Zona Sul']);
  });

  it('seeds 3 menu items covering all tipo values', async () => {
    const count = await prisma.menuItem.count();
    expect(count).toBe(3);
    const tipos = await prisma.menuItem.groupBy({ by: ['tipo'] });
    expect(tipos.map((t) => t.tipo).sort()).toEqual(['atendente', 'entrega', 'texto']);
  });
});
