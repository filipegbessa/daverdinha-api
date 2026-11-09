import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './cart-item.dto';

export class QuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  /** Com ou sem máscara; sem CEP, a cotação diz `no_cep` na entrega. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cep?: string;
}
