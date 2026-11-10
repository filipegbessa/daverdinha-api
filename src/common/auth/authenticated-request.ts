import type { Request } from 'express';
import type { verifyToken } from '@clerk/backend';

/** As claims do token de sessão do Clerk, como o `verifyToken` devolve. */
export type ClerkClaims = Awaited<ReturnType<typeof verifyToken>>;

/** A requisição depois do `ClerkAuthGuard`, que pendura as claims em `auth`. */
export interface AuthenticatedRequest extends Request {
  auth: ClerkClaims;
}
