import express, { json } from 'express';
import request from 'supertest';
import { clerkProxyMiddleware } from './clerk-proxy.middleware';

// A production instance is reached through Clerk's shared Frontend API host
// and told apart by its secret key — not through clerk.<your-domain>.
const FAPI_HOST = 'frontend-api.clerk.dev';
const env = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from('clerk.example.com$').toString('base64')}`,
  CLERK_SECRET_KEY: 'sk_live_secret',
};

describe('clerkProxyMiddleware', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  // Same order as configureApp: proxy first, then the JSON parser and routes.
  const app = express();
  app.use(clerkProxyMiddleware(env));
  app.use(json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('leaves every other route alone', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
    await request(app).get('/__clerkish').expect(404);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards to the Frontend API as Clerk expects a proxy to', async () => {
    fetchMock.mockResolvedValue(new Response('{"object":"environment"}', { status: 200 }));

    await request(app)
      .get('/__clerk/v1/environment?__clerk_api_version=2026-05-12')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'daverdinha-api.vercel.app')
      .expect(200, '{"object":"environment"}');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://${FAPI_HOST}/v1/environment?__clerk_api_version=2026-05-12`);
    const headers = init.headers as Headers;
    expect(headers.get('Clerk-Proxy-Url')).toBe('https://daverdinha-api.vercel.app/__clerk');
    expect(headers.get('Clerk-Secret-Key')).toBe('sk_live_secret');
    expect(headers.get('Host')).toBe(FAPI_HOST);
  });

  // Sign-in posts form-encoded bodies; they have to reach Clerk byte for
  // byte, and the session cookies have to come back as separate headers.
  it('passes the raw body through and returns every cookie and the status', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const sent = await new Response(init.body as BodyInit).text();
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', '__client=abc; Expires=Wed, 07 Oct 2027 10:00:00 GMT; Path=/');
      headers.append('Set-Cookie', '__session=def; Path=/');
      return new Response(JSON.stringify({ sent }), { status: 422, headers });
    });

    const response = await request(app)
      .post('/__clerk/v1/client/sign_ins')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('identifier=a%40b.com&strategy=password');

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ sent: 'identifier=a%40b.com&strategy=password' });
    expect(response.headers['set-cookie']).toEqual([
      '__client=abc; Expires=Wed, 07 Oct 2027 10:00:00 GMT; Path=/',
      '__session=def; Path=/',
    ]);
  });

  it('sends a JSON body through untouched too, since it runs before the parser', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      new Response(await new Response(init.body as BodyInit).text(), { status: 200 }),
    );

    const response = await request(app).post('/__clerk/v1/x').set('Content-Type', 'application/json').send('{"a": 1}');

    expect(response.text).toBe('{"a": 1}');
  });
});
