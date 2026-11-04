import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Sem `slug`: ele é gerado do nome na criação e nunca editado, porque é a URL
 * da categoria no site.
 */
export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Texto de abertura da página da categoria no site. */
  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  order?: number;
}
