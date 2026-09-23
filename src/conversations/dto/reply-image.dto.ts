import { IsOptional, IsString } from 'class-validator';

/**
 * Os campos de texto que acompanham o arquivo no multipart. O arquivo em si
 * não passa por aqui — vem pelo `FileInterceptor`, e é validado no service.
 */
export class ReplyImageDto {
  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}
