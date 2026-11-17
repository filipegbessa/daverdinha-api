import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  emptyToNull,
  toBoolean,
  toNullableInt,
  toNullableNumber,
  trim,
} from '../../common/transforms';

/**
 * Chega como `multipart/form-data` (junto com as fotos), então todo número e
 * booleano vem como string e precisa de conversão explícita.
 */
export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  /**
   * Preço promocional, menor que `price`; vazio = sem promoção. Números
   * literais porque o plugin do OpenAPI não lê constantes.
   */
  @IsOptional()
  @Transform(toNullableNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  promoPrice?: number | null;

  /** Início da promoção (ISO 8601); vazio = já vale. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  promoStartsAt?: string | null;

  /** Fim da promoção (ISO 8601), exclusivo; vazio = não acaba. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  promoEndsAt?: string | null;

  @IsUUID()
  categoryId: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  order?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  /** Aparece na vitrine da home e nas listas das páginas internas. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  featured?: boolean;

  /** Com número: pronta entrega (0 = esgotado). `null`: sob encomenda. */
  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(0)
  stock?: number | null;

  /** Prazo de confecção em dias; obrigatório quando o produto é sob encomenda. */
  @IsOptional()
  @Transform(toNullableInt)
  @IsInt()
  @Min(1)
  @Max(180)
  leadTimeDays?: number | null;
}
