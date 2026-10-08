/**
 * The standalone docs page served at `GET /docs`: its own HTML, its own
 * login, nothing shared with the admin's bundle or styles.
 *
 * - Login is Clerk's own sign-in component, loaded from the instance's
 *   Frontend API — the same users as the admin, and no new way into the API.
 * - Once signed in, the page fetches `/openapi.json` (Clerk-guarded) and
 *   hands it to Scalar. "Try it" asks Clerk for a token right before every
 *   request, because session tokens only live 60 seconds.
 *
 * Both scripts are pinned. Scalar comes from jsDelivr with an SRI hash taken
 * from the npm tarball of that exact version; bumping SCALAR_VERSION means
 * recomputing it (`openssl dgst -sha384 -binary standalone.js | openssl
 * base64 -A`). Clerk's script is served by Clerk itself and can't carry one.
 */

const SCALAR_VERSION = '1.46.4';
const SCALAR_SRI = 'sha384-BbTs28WithFYxTDCiH0YPK5tv3MflhBVpABoMjfb9UqXa/hegSE9I4THoddKejMF';
// Same major the admin's @clerk/nextjs loads.
const CLERK_JS_MAJOR = 6;

/**
 * A publishable key is `pk_test_` / `pk_live_` + base64 of the instance's
 * Frontend API host with a trailing `$`. That host is where Clerk serves its
 * browser script from.
 */
export function clerkFrontendApi(publishableKey: string): string {
  const match = /^pk_(test|live)_(.+)$/.exec(publishableKey);
  const host = match ? Buffer.from(match[2], 'base64').toString('utf8') : '';
  if (!host.endsWith('$') || !/^[a-z0-9.-]+\$$/i.test(host)) {
    throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY não é uma publishable key válida do Clerk.');
  }
  return host.slice(0, -1);
}

/** JSON that is safe to drop inside an inline <script>. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function renderDocsPage(publishableKey: string): string {
  const frontendApi = clerkFrontendApi(publishableKey);
  const clerkSrc = `https://${frontendApi}/npm/@clerk/clerk-js@${CLERK_JS_MAJOR}/dist/clerk.browser.js`;
  const scalarSrc = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Daverdinha API · Docs</title>
  <style>
    :root { color-scheme: light dark; --bg: #f7f7f5; --fg: #1d1d1b; --muted: #6b6b66; --line: #e2e2dc; }
    @media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ececea; --muted: #9a9a94; --line: #2c2c2a; } }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .gate { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
    .gate-inner { display: grid; justify-items: center; gap: 20px; }
    .brand { font-weight: 600; letter-spacing: -0.01em; }
    .brand small { display: block; text-align: center; color: var(--muted); font-weight: 400; }
    .status { color: var(--muted); }
    .status.error { color: #c0392b; }
    .bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between;
           height: 48px; padding: 0 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <main class="gate" id="gate">
    <div class="gate-inner">
      <p class="brand">Daverdinha API<small>Documentação</small></p>
      <p class="status" id="status" role="status">Carregando…</p>
      <div id="sign-in"></div>
    </div>
  </main>

  <div id="docs" hidden>
    <header class="bar">
      <span class="brand">Daverdinha API</span>
      <div id="user-button"></div>
    </header>
    <div id="reference"></div>
  </div>

  <script src="${scalarSrc}" integrity="${SCALAR_SRI}" crossorigin="anonymous"></script>
  <script>
    (function () {
      var publishableKey = ${scriptJson(publishableKey)};
      var gate = document.getElementById('gate');
      var docs = document.getElementById('docs');
      var status = document.getElementById('status');
      var rendered = false;

      // The error can come after the docs area took over the screen, so the
      // gate is brought back; the cause goes to the console.
      function fail(message, error) {
        if (error) console.error(error);
        gate.hidden = false;
        docs.hidden = true;
        status.textContent = message;
        status.className = 'status error';
        status.hidden = false;
      }

      async function showDocs(clerk) {
        if (rendered) return;
        rendered = true;
        status.textContent = 'Carregando documentação…';
        status.hidden = false;
        var token = await clerk.session.getToken();
        var response = await fetch('/openapi.json', { headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) {
          rendered = false;
          return fail('Não foi possível carregar a documentação (erro ' + response.status + ').');
        }
        var spec = await response.json();
        gate.hidden = true;
        docs.hidden = false;
        clerk.mountUserButton(document.getElementById('user-button'));
        Scalar.createApiReference('#reference', {
          content: spec,
          servers: [{ url: window.location.origin }],
          onBeforeRequest: async function (context) {
            var fresh = await clerk.session.getToken();
            if (fresh) context.request.headers.set('Authorization', 'Bearer ' + fresh);
          },
          // Nothing here should leave the browser for Scalar's servers: an
          // unset proxyUrl can fall back to proxy.scalar.com (which would
          // carry the Clerk token), the developer toolbar can upload the
          // spec, and the agent sends it to their AI.
          proxyUrl: '',
          showDeveloperTools: 'never',
          telemetry: false,
          agent: { disabled: true },
          documentDownloadType: 'none',
          metaData: { title: 'Daverdinha API · Docs' },
        });
      }

      function showSignIn(clerk) {
        status.hidden = true;
        // Sign-in redirects back here, so the page reloads already signed in.
        clerk.mountSignIn(document.getElementById('sign-in'), { forceRedirectUrl: window.location.href });
      }

      var script = document.createElement('script');
      script.src = ${scriptJson(clerkSrc)};
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.setAttribute('data-clerk-publishable-key', publishableKey);
      script.onerror = function () { fail('Não foi possível carregar o login.'); };
      script.onload = async function () {
        try {
          var clerk = window.Clerk;
          await clerk.load();
          clerk.addListener(function (state) {
            if (state.user) {
              clerk.unmountSignIn(document.getElementById('sign-in'));
              showDocs(clerk).catch(function (error) { rendered = false; fail('Erro ao carregar a documentação.', error); });
            } else if (rendered) {
              window.location.reload();
            }
          });
          if (!clerk.user) showSignIn(clerk);
        } catch (error) {
          fail('Não foi possível iniciar o login.', error);
        }
      };
      document.head.appendChild(script);
    })();
  </script>
</body>
</html>
`;
}
