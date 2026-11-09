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

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateStoreSettingsDto {
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : trim({ value }),
  )
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
