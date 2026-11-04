import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ListActiveProductsQuery {
  /** Slug da categoria. Um slug que não existe devolve `[]`, não 404. */
  @IsString()
  @IsOptional()
  category?: string;

  /** `?featured=true`: só os produtos em destaque (vitrine da home). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;
}
