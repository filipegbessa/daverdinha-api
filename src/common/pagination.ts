import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

export class PaginationQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  /**
   * Capped so a caller can't turn one request back into a full table scan.
   */
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  @IsOptional()
  @Type(() => Number)
  perPage?: number = DEFAULT_PER_PAGE;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Translates a page number into the `skip`/`take` a Prisma query wants. */
export function pageBounds(query: PaginationQueryDto) {
  const page = query.page ?? 1;
  const perPage = query.perPage ?? DEFAULT_PER_PAGE;
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

/**
 * `totalPages` floors at 1 so an empty table reads "Página 1 de 1" rather
 * than "1 de 0".
 */
export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
): Paginated<T> {
  return {
    items,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export { DEFAULT_PER_PAGE, MAX_PER_PAGE };
