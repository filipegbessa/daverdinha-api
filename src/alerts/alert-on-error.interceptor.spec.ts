import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { AlertOnErrorInterceptor } from './alert-on-error.interceptor';
import type { AlertsService } from './alerts.service';

describe('AlertOnErrorInterceptor', () => {
  const alerts = { alert: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new AlertOnErrorInterceptor(
    alerts as unknown as AlertsService,
  );
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: '/checkout' }),
    }),
  } as unknown as ExecutionContext;
  const failWith = (error: unknown) =>
    lastValueFrom(
      interceptor.intercept(context, { handle: () => throwError(() => error) }),
    );

  beforeEach(() => alerts.alert.mockClear());

  it('alerts on an unexpected error and lets it through', async () => {
    await expect(failWith(new Error('boom'))).rejects.toThrow('boom');
    expect(alerts.alert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'unexpected_error',
        detail: 'POST /checkout: boom',
      }),
    );
  });

  it('does not alert on an expected HTTP error', async () => {
    await expect(failWith(new ConflictException())).rejects.toThrow(
      ConflictException,
    );
    expect(alerts.alert).not.toHaveBeenCalled();
  });
});
