import { Test } from '@nestjs/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { DeliveryAreasService } from '../src/delivery-locations/delivery-areas.service';

/**
 * Contra o banco de verdade: a troca de bairros numa transação, o `SET NULL`
 * da FK ao apagar a área e o único por zona+nome são coisas que o mock não
 * prova. O service é chamado direto porque as rotas são do admin (Clerk).
 */
describe('Delivery areas and store settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let areas: DeliveryAreasService;
  const zone = 'E2E Zona';
  const locationIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    areas = app.get(DeliveryAreasService);

    for (const regionName of ['E2E Bairro A', 'E2E Bairro B', 'E2E Bairro C']) {
      const location = await prisma.deliveryLocation.create({
        data: { zone, regionName, covered: true },
      });
      locationIds.push(location.id);
    }
  });

  afterAll(async () => {
    await prisma.deliveryArea.deleteMany({ where: { zone } });
    await prisma.deliveryLocation.deleteMany({ where: { zone } });
    await app.close();
  });

  it('moves bairros between areas, frees them on delete and keeps names unique per zone', async () => {
    const [a, b, c] = locationIds;
    const near = await areas.create({ zone, name: 'Perto', fee: 15 });
    const far = await areas.create({ zone, name: 'Longe', fee: 30 });

    await areas.setLocations(near.id, [a, b]);
    await areas.setLocations(far.id, [c]);
    // Tirar o B de "Perto" o deixa sem área até ir pra outra.
    const updated = await areas.setLocations(near.id, [a]);
    expect(updated.locations.map((l) => l.id)).toEqual([a]);

    const zoneView = (await areas.listByZone()).find((z) => z.zone === zone);
    expect(zoneView?.unassigned.map((l) => l.id)).toEqual([b]);
    await expect(areas.feeForLocation(c)).resolves.toEqual(
      expect.objectContaining({ area: 'Longe' }),
    );
    await expect(areas.feeForLocation(b)).resolves.toBeNull();

    await expect(areas.create({ zone, name: 'Perto', fee: 1 })).rejects.toThrow(
      ConflictException,
    );

    await areas.remove(far.id);
    await expect(areas.feeForLocation(c)).resolves.toBeNull();
    const location = await prisma.deliveryLocation.findUnique({
      where: { id: c },
    });
    expect(location?.areaId).toBeNull();
  });

  it('keeps the area routes behind auth', async () => {
    await request(app.getHttpServer()).get('/delivery-areas').expect(401);
    await request(app.getHttpServer()).get('/store-settings').expect(401);
  });

  it('GET /store-settings/public is public and only shows the switches and the installments', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/store-settings/public')
      .expect(200);

    expect(Object.keys(body as object).sort()).toEqual([
      'maxInstallments',
      'minInstallmentValue',
      'siteEnabled',
      'storeEnabled',
      'ticketsEnabled',
    ]);
  });
});
