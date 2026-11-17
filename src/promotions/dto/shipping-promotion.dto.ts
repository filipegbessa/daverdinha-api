import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { emptyToNull } from '../../common/transforms';

/** "Frete grátis acima de R$ X" (JSON). Números literais: o plugin do OpenAPI não lê constantes. */
export class CreateShippingPromotionDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  name?: string | null;

  /** A partir de quanto (itens, já descontado o cupom). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999)
  minSubtotal: number;

  /** Vazio = todas as áreas de entrega. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  areaIds?: string[];

  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateShippingPromotionDto extends PartialType(
  CreateShippingPromotionDto,
) {}
