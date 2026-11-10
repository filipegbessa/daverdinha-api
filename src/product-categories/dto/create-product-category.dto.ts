import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { trim } from '../../common/transforms';

/**
 * Sem `slug`: ele é gerado do nome na criação e nunca editado, porque é a URL
 * da categoria no site.
 */
export class CreateProductCategoryDto {
  @Transform(trim)
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
