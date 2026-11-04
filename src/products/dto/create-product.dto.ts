import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Chega como `multipart/form-data` (junto com as fotos), então todo número e
 * booleano vem como string e precisa de conversão explícita.
 */
export class CreateProductDto {
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

  // `@Type(() => Boolean)` não serve: `Boolean('false')` é `true`.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  active?: boolean;

  /** Aparece na vitrine da home e nas listas das páginas internas. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;
}
