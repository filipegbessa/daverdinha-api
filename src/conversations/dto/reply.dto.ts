import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { trim } from '../../common/transforms';

export class ReplyDto {
  /** Não pode ser vazio: a Cloud API recusa mensagem de texto sem corpo. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}
