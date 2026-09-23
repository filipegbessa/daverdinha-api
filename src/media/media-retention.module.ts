import { Module } from '@nestjs/common';
import { CronSecretModule } from '../common/auth/cron-secret.module';
import { MediaStorageModule } from './media-storage.module';
import { MediaRetentionService } from './media-retention.service';
import { MediaRetentionController } from './media-retention.controller';

@Module({
  imports: [CronSecretModule, MediaStorageModule],
  providers: [MediaRetentionService],
  controllers: [MediaRetentionController],
})
export class MediaRetentionModule {}
