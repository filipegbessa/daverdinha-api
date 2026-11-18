import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';
import { AlertsService } from './alerts.service';

/**
 * Nas rotas da venda (checkout e webhook do Pagar.me), um erro inesperado
 * (o que não é `HttpException`, e que o Nest devolve como 500) vira alerta
 * antes de seguir pro tratamento normal. Os erros esperados (400, 409,
 * 422, 429, 503 do pagamento) não alertam aqui: os que importam já avisam
 * de onde nascem, com mais contexto.
 */
@Injectable()
export class AlertOnErrorInterceptor implements NestInterceptor {
  constructor(private readonly alerts: AlertsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) return throwError(() => error);
        const req = context.switchToHttp().getRequest<Request>();
        const route = `${req.method} ${req.originalUrl ?? req.url}`;
        return from(
          this.alerts.alert({
            kind: 'unexpected_error',
            title: 'Erro inesperado na venda pelo site',
            detail: `${route}: ${(error as Error)?.message ?? String(error)}`,
          }),
        ).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }
}
