import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { trim } from '../../common/transforms';

export const CUSTOMER_SORTS = ['recent', 'spent', 'orders'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export class ListCustomersDto extends PaginationQueryDto {
  /** Nome, e-mail ou telefone (só os dígitos contam no telefone). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  /** `recent` (última compra, o padrão), `spent` (total gasto) ou `orders` (nº de pedidos). */
  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sort?: CustomerSort;
}
