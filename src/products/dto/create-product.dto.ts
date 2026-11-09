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

/** Campo vazio vira `null`: é como o admin marca "sob encomenda" ou limpa o prazo. */
const toNullableInt = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === 'null' ? null : Number(value);

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
