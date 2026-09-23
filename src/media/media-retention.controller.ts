import { Controller, Get, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../common/auth/cron-secret.guard';
import { MediaRetentionService } from './media-retention.service';

/**
 * A Vercel chama cron com `GET`, não `POST` — não é convenção REST, é o que
 * a plataforma manda.
 */
@Controller('cron/media-retention')
@UseGuards(CronSecretGuard)
export class MediaRetentionController {
  constructor(private readonly retention: MediaRetentionService) {}

  /**
   * Ordem dentro do job: **apagar → reconciliar**. Reconciliar antes
   * gravaria um número que a purga desta mesma execução ia invalidar em
   * seguida.
   */
  @Get()
  async run() {
    const purge = await this.retention.purgeExpired();
    const reconcile = await this.retention.reconcileUsage();
    return {
      purged: purge.purged,
      mediaBytesUsed: reconcile.mediaBytesUsed.toString(),
    };
  }
}
