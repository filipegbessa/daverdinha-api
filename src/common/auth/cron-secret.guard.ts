import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Protege rotas disparadas pelo cron da Vercel. Como o cron não é processo
 * em segundo plano — é a Vercel chamando uma URL da própria API no horário
 * marcado — qualquer um poderia chamar essa URL sem isto, e a que ela
 * protege apaga arquivo. A Vercel manda `Authorization: Bearer
 * $CRON_SECRET` sozinha quando a variável existe; comparar com
 * `timingSafeEqual` em vez de `===` é o que evita vazar o segredo por
 * quanto tempo a comparação levou.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new UnauthorizedException('CRON_SECRET não configurado');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const receivedBuffer = Buffer.from(authHeader.slice('Bearer '.length));
    const expectedBuffer = Buffer.from(secret);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    return true;
  }
}
