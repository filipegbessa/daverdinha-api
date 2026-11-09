import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /menu-items without a token returns 401', () => {
    return request(app.getHttpServer()).get('/menu-items').expect(401);
  });

  // Sem token e sem chamar a BrasilAPI: CEP inválido é resolvido antes.
  it('GET /delivery-locations/check is public and answers a bad CEP with unresolved, not 400', () => {
    return request(app.getHttpServer())
      .get('/delivery-locations/check?cep=abc')
      .expect(200)
      .expect({ status: 'unresolved' });
  });

  it('GET /delivery-locations/check without a cep is also unresolved', () => {
    return request(app.getHttpServer())
      .get('/delivery-locations/check')
      .expect(200)
      .expect({ status: 'unresolved' });
  });
});
