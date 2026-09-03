import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MenuItemAnswerOptionDto {
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @IsString()
  reply: string;
}

export class CreateMenuItemDto {
  @IsInt()
  order: number;

  @IsString()
  topic: string;

  @IsIn(['texto', 'entrega', 'atendente', 'pergunta'])
  type: 'texto' | 'entrega' | 'atendente' | 'pergunta';

  @IsString()
  @IsOptional()
  reply?: string;

  @IsString()
  @IsOptional()
  question?: string;

  @IsString()
  @IsOptional()
  noMatchReply?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemAnswerOptionDto)
  @IsOptional()
  answerOptions?: MenuItemAnswerOptionDto[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
