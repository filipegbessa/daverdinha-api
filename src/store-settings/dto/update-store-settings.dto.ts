import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { emptyToNull, trim } from '../../common/transforms';

export class UpdateStoreSettingsDto {
  /** Site completo em `/` (ligado) ou página "em breve" (desligado). */
  @IsOptional()
  @IsBoolean()
  siteEnabled?: boolean;

  /** Venda pelo site. Liga mesmo sem a chave do Pagar.me (o pagamento é que não inicia). */
  @IsOptional()
  @IsBoolean()
  storeEnabled?: boolean;

  /** Venda de ingressos pelo site, independente da loja. Também liga sem a chave do Pagar.me. */
  @IsOptional()
  @IsBoolean()
  ticketsEnabled?: boolean;

  /** Desligada, o checkout não oferece retirada. */
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  /** Não pode ficar vazio: pra tirar a retirada, desliga `pickupEnabled`. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  pickupAddress?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  pickupHours?: string;

  /** Texto livre ("toque o interfone 2"); vazio vira `null`. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  pickupInstructions?: string | null;

  /** 1 = só à vista. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  maxInstallments?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999)
  minInstallmentValue?: number;
}
