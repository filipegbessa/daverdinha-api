import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { toBoolean, toNullableInt, trim } from '../../common/transforms';

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
