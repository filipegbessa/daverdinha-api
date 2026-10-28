import { Module } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';
import { AudioTranscodeService } from './audio-transcode.service';

@Module({
  providers: [MediaStorageService, AudioTranscodeService],
  exports: [MediaStorageService, AudioTranscodeService],
})
export class MediaStorageModule {}
