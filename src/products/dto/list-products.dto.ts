import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

/** `"true"`/`"false"` da query string vira booleano; qualquer outra coisa some (sem filtro). */
const toOptionalBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : undefined;

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
