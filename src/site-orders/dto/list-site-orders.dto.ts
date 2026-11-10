import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { trim } from '../../common/transforms';

export const SITE_ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'expired',
  'cancelled',
  'refunded',
] as const;

/** Filtros da lista do admin. Sem `status`, a lista mostra só os pagos. */
export class ListSiteOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SITE_ORDER_STATUSES)
  status?: (typeof SITE_ORDER_STATUSES)[number];

  @IsOptional()
  @IsIn(['products', 'tickets'])
  kind?: 'products' | 'tickets';

  /** Código (`DV-0042`, `42`) ou nome do comprador. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
