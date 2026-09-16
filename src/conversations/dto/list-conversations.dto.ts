import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ListConversationsDto extends PaginationQueryDto {
  /** Free text matched against the contact name and the phone number. */
  @IsString()
  @IsOptional()
  q?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  unread?: boolean;

  @IsString()
  @IsOptional()
  categoryId?: string;
}
