import { clerkFrontendApiProxy, DEFAULT_PROXY_PATH } from '@clerk/backend/proxy';
import type { NextFunction, Request, Response } from 'express';
import getRawBody from 'raw-body';

/**
 * Serves `/__clerk/*` by forwarding it to Clerk's Frontend API.
 *
 * Needed by the `/docs` page: on a `*.vercel.app` host with a production
 * key, Clerk's browser script switches on its "auto-proxy" and talks to
 * `/__clerk` on the page's own origin instead of Clerk's domain (a
 * production instance can't set its cookies on vercel.app directly). The
 * admin gets this for free from `clerkMiddleware`; here it has to exist by
 * hand, or the sign-in dies on a 404.
 *
 * The forwarding itself is Clerk's own `clerkFrontendApiProxy`; this only
 * adapts Express to the fetch `Request`/`Response` it speaks. It must run
 * before the JSON body parser: the body goes to Clerk as raw bytes.
 */
export function clerkProxyMiddleware(env: NodeJS.ProcessEnv = process.env) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path !== DEFAULT_PROXY_PATH && !req.path.startsWith(`${DEFAULT_PROXY_PATH}/`)) {
      return next();
    }

    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      // The helper derives the public origin it reports to Clerk from
      // X-Forwarded-Proto/Host, which Vercel sets; the URL's own host is
      // just a fallback for local runs.
      const request = new Request(`http://${req.headers.host}${req.originalUrl}`, {
        method: req.method,
        headers,
        body: hasBody ? new Uint8Array(await getRawBody(req)) : undefined,
      });

      const response = await clerkFrontendApiProxy(request, {
        publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        secretKey: env.CLERK_SECRET_KEY,
      });

      res.status(response.status);
      response.headers.forEach((value, key) => {
        // Folded into one comma-joined value by `forEach`; sent below one
        // by one, since a cookie's own `Expires=` contains a comma.
        if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  };
}
