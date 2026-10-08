import { clerkFrontendApi, renderDocsPage } from './docs-page';
import { DocsPageController } from './docs-page.controller';

/** What Clerk issues: the Frontend API host plus `$`, base64'd. */
const keyFor = (host: string, env = 'test') => `pk_${env}_${Buffer.from(`${host}$`).toString('base64')}`;

describe('clerkFrontendApi', () => {
  it('decodes the Frontend API host out of test and live keys', () => {
    expect(clerkFrontendApi(keyFor('clerk.example.com', 'live'))).toBe('clerk.example.com');
    expect(clerkFrontendApi(keyFor('happy-cat-12.clerk.accounts.dev'))).toBe('happy-cat-12.clerk.accounts.dev');
  });

  // The host ends up in a <script src>, so anything that doesn't decode to a
  // plain hostname is refused rather than interpolated.
  it.each(['sk_test_abc', 'pk_test_', keyFor('evil.com"><script>'), 'pk_live_bm90LWEta2V5'])('rejects %s', (key) => {
    expect(() => clerkFrontendApi(key)).toThrow(/publishable key/);
  });
});

describe('renderDocsPage', () => {
  const html = renderDocsPage(keyFor('clerk.example.com', 'live'));

  it('loads Clerk from the instance itself, on the admin’s major version', () => {
    expect(html).toContain('https://clerk.example.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js');
  });

  it('pins Scalar to a version with an integrity hash', () => {
    expect(html).toMatch(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+\/dist\/browser\/standalone\.js" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"><\/script>/,
    );
  });

  it('keeps the Clerk token and the spec away from Scalar’s servers', () => {
    expect(html).toContain("proxyUrl: ''");
    expect(html).toContain("showDeveloperTools: 'never'");
    expect(html).toContain('telemetry: false');
    expect(html).toContain('agent: { disabled: true }');
  });

  it('gets a fresh Clerk token for every "Try it" request', () => {
    expect(html).toMatch(/onBeforeRequest: async function \(context\) \{\s+var fresh = await clerk\.session\.getToken\(\);/);
  });

  it('asks crawlers to stay away', () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});

describe('DocsPageController', () => {
  const original = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  afterEach(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
  });

  it('serves the page built from NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = keyFor('clerk.example.com', 'live');

    expect(new DocsPageController().page()).toContain('clerk.example.com/npm/@clerk/clerk-js');
  });

  it('answers 503 with the reason when the key is not configured', () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    expect(() => new DocsPageController().page()).toThrow('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY não configurada.');
  });
});

/**
 * Runs the page's inline script against stand-ins for the DOM, Clerk and
 * Scalar — enough to check the flow without a browser.
 */
describe('docs page script', () => {
  const vm = require('vm') as typeof import('vm');

  function boot({ user }: { user: boolean }) {
    const elements: Record<string, any> = {};
    const el = (id: string) => (elements[id] ??= { id, hidden: false, textContent: '', className: '' });
    let clerkScript: any;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ openapi: '3.0.0' }) });
    const clerk = {
      user: user ? { id: 'u1' } : null,
      session: { getToken: jest.fn().mockResolvedValueOnce('page-token').mockResolvedValue('fresh-token') },
      load: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn((listener: (s: unknown) => void) => listener({ user: clerk.user })),
      mountSignIn: jest.fn(),
      unmountSignIn: jest.fn(),
      mountUserButton: jest.fn(),
    };
    const Scalar = { createApiReference: jest.fn() };
    const window: any = { location: { origin: 'https://api.example.com', href: 'https://api.example.com/docs' } };
    const document = {
      getElementById: el,
      createElement: () => ({ setAttribute(k: string, v: string) { (this as any)[k] = v; } }),
      head: { appendChild: (s: any) => (clerkScript = s) },
    };
    window.Clerk = clerk;

    const html = renderDocsPage(keyFor('clerk.example.com', 'live'));
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    const console = { error: jest.fn() };
    vm.runInNewContext(inline, { window, document, fetch: fetchMock, Scalar, console });

    return { clerk, Scalar, fetchMock, el, console, loadClerk: () => clerkScript.onload(), clerkScript };
  }

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('injects the Clerk script from the instance, carrying the publishable key', () => {
    const { clerkScript } = boot({ user: false });

    expect(clerkScript.src).toBe('https://clerk.example.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js');
    expect(clerkScript['data-clerk-publishable-key']).toBe(keyFor('clerk.example.com', 'live'));
  });

  it('shows the Clerk sign-in, and nothing else, to a signed-out visitor', async () => {
    const { clerk, Scalar, fetchMock, loadClerk } = boot({ user: false });

    await loadClerk();
    await flush();

    expect(clerk.mountSignIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'sign-in' }), {
      forceRedirectUrl: 'https://api.example.com/docs',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Scalar.createApiReference).not.toHaveBeenCalled();
  });

  it('fetches the spec with the session token and hands it to Scalar once signed in', async () => {
    const { clerk, Scalar, fetchMock, el, loadClerk } = boot({ user: true });

    await loadClerk();
    await flush();

    expect(clerk.mountSignIn).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/openapi.json', { headers: { Authorization: 'Bearer page-token' } });
    expect(el('gate').hidden).toBe(true);
    expect(el('docs').hidden).toBe(false);
    const [target, config] = Scalar.createApiReference.mock.calls[0];
    expect(target).toBe('#reference');
    expect(config.content).toEqual({ openapi: '3.0.0' });
    expect(config.servers).toEqual([{ url: 'https://api.example.com' }]);

    const headers = { set: jest.fn() };
    await config.onBeforeRequest({ request: { headers } });
    expect(headers.set).toHaveBeenCalledWith('Authorization', 'Bearer fresh-token');
  });

  it('says so when the spec can’t be loaded, instead of a blank page', async () => {
    const { fetchMock, el, loadClerk, Scalar } = boot({ user: true });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    await loadClerk();
    await flush();

    expect(el('status').textContent).toMatch(/erro 401/);
    expect(Scalar.createApiReference).not.toHaveBeenCalled();
  });

  // Scalar runs after the docs area replaced the gate; a failure there must
  // not leave a blank page.
  it('brings the gate back with the message, and logs the cause, when rendering fails', async () => {
    const { Scalar, el, console, loadClerk } = boot({ user: true });
    const cause = new Error('Scalar is not defined');
    Scalar.createApiReference.mockImplementation(() => {
      throw cause;
    });

    await loadClerk();
    await flush();

    expect(el('gate').hidden).toBe(false);
    expect(el('docs').hidden).toBe(true);
    expect(el('status').textContent).toBe('Erro ao carregar a documentação.');
    expect(console.error).toHaveBeenCalledWith(cause);
  });
});
