import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { BotEngineService } from '../src/bot-engine/bot-engine.service';

describe('Webhook (e2e)', () => {
  let app: INestApplication;
  const appSecret = 'test-app-secret';
  const handleIncomingMessage = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.WHATSAPP_APP_SECRET = appSecret;
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BotEngineService)
      .useValue({ handleIncomingMessage })
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /webhook/whatsapp echoes hub.challenge when the verify token matches', () => {
    return request(app.getHttpServer())
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-verify-token',
        'hub.challenge': '12345',
      })
      .expect(200)
      .expect('12345');
  });

  it('GET /webhook/whatsapp rejects a wrong verify token', () => {
    return request(app.getHttpServer())
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': '12345',
      })
      .expect(403);
  });

  it('POST /webhook/whatsapp rejects a request with an invalid signature', () => {
    return request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', 'sha256=invalid')
      .send({ entry: [] })
      .expect(403);
  });

  it('POST /webhook/whatsapp accepts a validly signed request and delegates to BotEngineService', async () => {
    const payload = { entry: [{ id: '1' }] };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    await request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    expect(handleIncomingMessage).toHaveBeenCalledWith(payload);
  });
});
