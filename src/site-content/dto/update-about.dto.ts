import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { emptyToNull, toBoolean, trim } from '../../common/transforms';

/**
 * A seção "Sobre" inteira de uma vez (o admin tem um formulário só), em
 * `multipart/form-data` por causa da foto. Título e texto são obrigatórios:
 * salvo, o "Sobre" passa a ser este e deixa de usar o texto do código.
 */
export class UpdateAboutDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  /** Parágrafos separados por linha em branco. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  /** Texto do link pro Instagram. Vazio, o "Sobre" fica sem o link. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  instagramLabel?: string | null;

  /** `true` apaga a foto atual sem mandar outra. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  removeImage?: boolean;
}
