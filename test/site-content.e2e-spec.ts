import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Contra o banco de verdade: as rotas públicas da home não caem no guard do
 * admin (`/hero-slides/active` antes de `/hero-slides/:id`) e a validade dos
 * destaques é filtrada pelo Postgres.
 */
describe('Home content (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const ids: string[] = [];
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();

    const now = Date.now();
    for (const data of [
      { title: 'E2E No ar', order: 100 },
      { title: 'E2E Desligado', order: 101, active: false },
      {
        title: 'E2E Acabou',
        order: 102,
        endsAt: new Date(now - hour),
      },
      {
        title: 'E2E Ainda não',
        order: 103,
        startsAt: new Date(now + hour),
      },
      {
        title: 'E2E Campanha',
        order: 104,
        startsAt: new Date(now - hour),
        endsAt: new Date(now + hour),
      },
    ]) {
      const row = await prisma.heroSlide.create({ data });
      ids.push(row.id);
    }
  });

  afterAll(async () => {
    await prisma.heroSlide.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /hero-slides/active is public and lists only live slides, in order', async () => {
    const res = await request(app.getHttpServer())
      .get('/hero-slides/active')
      .expect(200);

    const titles = (res.body as { title: string }[])
      .map((slide) => slide.title)
      .filter((title) => title.startsWith('E2E'));
    expect(titles).toEqual(['E2E No ar', 'E2E Campanha']);
  });

  it('GET /hero-slides (admin) needs a token', async () => {
    await request(app.getHttpServer()).get('/hero-slides').expect(401);
    await request(app.getHttpServer())
      .get(`/hero-slides/${ids[0]}`)
      .expect(401);
  });

  it('GET /site-content/about is public; saving it needs a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/site-content/about')
      .expect(200);
    expect(res.body).toHaveProperty('configured');

    await request(app.getHttpServer())
      .put('/site-content/about')
      .field('title', 'T')
      .field('text', 'X')
      .expect(401);
  });
});
