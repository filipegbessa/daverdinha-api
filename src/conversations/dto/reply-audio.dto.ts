import { IsOptional, IsString } from 'class-validator';

/**
 * O campo de texto que acompanha o áudio no multipart. Sem legenda: a Cloud
 * API não aceita legenda em áudio. O arquivo vem pelo `FileInterceptor`.
 */
export class ReplyAudioDto {
  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}
