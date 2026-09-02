import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateMenuItemDto {
  @IsInt()
  ordem: number;

  @IsString()
  tema: string;

  @IsIn(['texto', 'entrega', 'atendente'])
  tipo: 'texto' | 'entrega' | 'atendente';

  @IsString()
  @IsOptional()
  resposta?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
