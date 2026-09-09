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

  it('seeds delivery locations from the fixture rj-bairros.json, covering 4 zones', async () => {
    // Full official IPP bairro list (161 bairros mapped to Áreas de
    // Planejamento 1-5, cross-referenced against the popular Zona
    // Sul/Norte/Oeste/Centro convention) — see
    // prisma/data/rj-bairros.json.
    const count = await prisma.deliveryLocation.count();
    expect(count).toBe(160);
    const zonas = await prisma.deliveryLocation.groupBy({ by: ['zone'] });
    expect(zonas.map((z) => z.zone).sort()).toEqual([
      'Centro',
      'Zona Norte',
      'Zona Oeste',
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
