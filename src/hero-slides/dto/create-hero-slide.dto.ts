import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { emptyToNull, toBoolean, trim } from '../../common/transforms';

/** Link do botão: um caminho do próprio site ou um endereço `http(s)`. */
export const SLIDE_LINK_PATTERN = /^(\/\S*|https?:\/\/\S+)$/;

/**
 * Chega como `multipart/form-data` (por causa da imagem), então tudo vem como
 * string. Campo opcional enviado vazio vira `null`: sem botão, sem validade.
 * Os limites de tamanho são os do desenho do 5.3, pro texto caber no slide.
 */
export class CreateHeroSlideDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(60)
  eyebrow?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  /** Texto do botão principal. Só aparece com o link também preenchido. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(30)
  linkLabel?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  @Matches(SLIDE_LINK_PATTERN, {
    message:
      'O link do botão precisa começar com "/" (página do site) ou "https://".',
  })
  linkUrl?: string | null;

  /** Sem texto, o site escreve "Falar no WhatsApp". */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(30)
  whatsappLabel?: string | null;

  /** A mensagem que já vai escrita na conversa. Sem ela, não há botão. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  whatsappMessage?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  /** ISO 8601 com fuso. Vazio = sem data de início. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({ strict: true })
  startsAt?: string | null;

  /** ISO 8601 com fuso. Vazio = sem data de fim. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({ strict: true })
  endsAt?: string | null;
}
