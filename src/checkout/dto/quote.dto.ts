import { Transform, Type } from 'class-transformer';
import { normalizeCode } from '../../coupons/dto/coupon.dto';
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

  /** Código do cupom, de qualquer jeito (vira maiúsculas). Inválido: a cotação explica, o pedido é 422. */
  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @MaxLength(30)
  couponCode?: string;
}
