import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { trim } from '../../common/transforms';

export class ListAttendeesDto extends PaginationQueryDto {
  /** Parte do nome do participante ou do comprador. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
