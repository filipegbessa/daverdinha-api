import { Module } from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard';

@Module({
  providers: [CronSecretGuard],
  exports: [CronSecretGuard],
})
export class CronSecretModule {}
