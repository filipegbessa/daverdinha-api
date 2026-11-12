import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Contra o banco de verdade: a ordem das rotas (`/events/upcoming` não pode
 * cair no guard do admin nem virar `:slug = 'upcoming'`), o filtro por data
 * feito pelo Postgres e o rascunho que nunca vaza.
 */
describe('Public agenda (e2e)', () => {
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
      // Em andamento: começou há 1h, termina daqui a 1h. Continua na lista.
      {
        title: 'E2E Em andamento',
        slug: 'e2e-em-andamento',
        startsAt: new Date(now - hour),
        endsAt: new Date(now + hour),
        published: true,
        price: '45.50',
      },
      {
        title: 'E2E Passado',
        slug: 'e2e-passado',
        startsAt: new Date(now - 3 * hour),
        endsAt: new Date(now - 2 * hour),
        published: true,
      },
      // Sem horário de fim, começou agora: fica na lista até o fim do dia.
      {
        title: 'E2E Sem fim',
        slug: 'e2e-sem-fim',
        startsAt: new Date(now),
        endsAt: null,
        published: true,
      },
      {
        title: 'E2E Rascunho',
        slug: 'e2e-rascunho',
        startsAt: new Date(now + hour),
        endsAt: new Date(now + 2 * hour),
      },
    ]) {
      const row = await prisma.event.create({
        data: { ...data, description: 'E2E.' },
      });
      ids.push(row.id);
    }
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /events/upcoming is public and lists only published events that have not ended', async () => {
    const res = await request(app.getHttpServer())
      .get('/events/upcoming')
      .expect(200);

    const slugs = (res.body as { slug: string }[]).map((e) => e.slug);
    expect(slugs).toContain('e2e-em-andamento');
    expect(slugs).toContain('e2e-sem-fim');
    expect(slugs).not.toContain('e2e-passado');
    expect(slugs).not.toContain('e2e-rascunho');
    const ongoing = (res.body as { slug: string; price: unknown }[]).find(
      (e) => e.slug === 'e2e-em-andamento',
    );
    expect(ongoing?.price).toBe(45.5);
  });

  it('GET /events/:slug serves a past event and hides a draft', async () => {
    await request(app.getHttpServer()).get('/events/e2e-passado').expect(200);
    await request(app.getHttpServer()).get('/events/e2e-rascunho').expect(404);
  });

  it('GET /events (admin list) needs a token', async () => {
    await request(app.getHttpServer()).get('/events').expect(401);
  });
});
