import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard';
import * as clerkBackend from '@clerk/backend';

jest.mock('@clerk/backend');

function mockContext(authHeader?: string): ExecutionContext {
  const request: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;

  beforeEach(() => {
    guard = new ClerkAuthGuard();
    jest.clearAllMocks();
  });

  it('rejects requests with no Authorization header', async () => {
    await expect(guard.canActivate(mockContext())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests when verifyToken throws', async () => {
    (clerkBackend.verifyToken as jest.Mock).mockRejectedValue(new Error('bad token'));
    await expect(guard.canActivate(mockContext('Bearer bad-token'))).rejects.toThrow(UnauthorizedException);
  });

  it('allows requests with a valid token and attaches the claims to the request', async () => {
    (clerkBackend.verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_123' });
    const context = mockContext('Bearer good-token');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.auth).toEqual({ sub: 'user_123' });
  });
});
