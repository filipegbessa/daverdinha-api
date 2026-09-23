import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard';

function mockContext(authHeader?: string): ExecutionContext {
  const request: any = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('CronSecretGuard', () => {
  let guard: CronSecretGuard;
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    guard = new CronSecretGuard();
    process.env.CRON_SECRET = 'super-secret';
  });

  afterAll(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects when CRON_SECRET is not configured — the route must not open by omission', () => {
    delete process.env.CRON_SECRET;
    expect(() => guard.canActivate(mockContext('Bearer super-secret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with no Authorization header', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token that does not match the secret', () => {
    expect(() => guard.canActivate(mockContext('Bearer wrong-secret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token of a different length than the secret, without crashing timingSafeEqual', () => {
    expect(() => guard.canActivate(mockContext('Bearer short'))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows the exact secret Vercel sends', () => {
    expect(guard.canActivate(mockContext('Bearer super-secret'))).toBe(true);
  });
});
