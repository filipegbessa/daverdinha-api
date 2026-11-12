import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ListEventsDto extends PaginationQueryDto {
  /** Parte do título, sem diferenciar maiúsculas. */
  @IsString()
  @IsOptional()
  q?: string;
}
