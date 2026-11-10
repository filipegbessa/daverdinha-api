import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { toOptionalBoolean } from '../../common/transforms';

/** Filtros da lista do admin; todos opcionais e combináveis. */
export class ListProductsDto extends PaginationQueryDto {
  /** Parte do nome, sem diferenciar maiúsculas. */
  @IsString()
  @IsOptional()
  q?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  /** "Aparece no site". */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  active?: boolean;

  /** "Mostrar na home". */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  featured?: boolean;
}
