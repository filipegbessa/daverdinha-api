import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateMenuItemDto {
  @IsInt()
  order: number;

  @IsString()
  topic: string;

  @IsIn(['texto', 'entrega', 'atendente'])
  type: 'texto' | 'entrega' | 'atendente';

  @IsString()
  @IsOptional()
  reply?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
