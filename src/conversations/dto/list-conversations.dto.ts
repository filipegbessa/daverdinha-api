import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { toBoolean } from '../../common/transforms';

export class ListConversationsDto extends PaginationQueryDto {
  /**
   * Texto livre, comparado com o nome do contato e com o telefone. No
   * telefone vale qualquer formatação ("+55 (21) 98444-8130", "98444-8130"):
   * a busca usa só os dígitos.
   */
  @IsString()
  @IsOptional()
  q?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(toBoolean)
  unread?: boolean;

  @IsUUID()
  @IsOptional()
  categoryId?: string;
}
