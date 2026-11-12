import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './cart-item.dto';
import { CustomerDto } from './customer.dto';

export class AddressDto {
  /** Com ou sem máscara: 8 dígitos. */
  @IsString()
  @MaxLength(20)
  @Matches(/^(?:\D*\d){8}\D*$/, { message: 'cep deve ter 8 dígitos' })
  cep: string;

  @IsString()
  @Length(1, 200)
  street: string;

  @IsString()
  @Length(1, 20)
  number: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  complement?: string;
}

/** O pedido do site. Só quantidades e dados do comprador: preço e frete vêm do banco. */
export class CreateCheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @IsIn(['pickup', 'delivery'])
  deliveryMethod: 'pickup' | 'delivery';

  /** Obrigatório na entrega; ignorado na retirada. */
  @ValidateIf((dto: CreateCheckoutDto) => dto.deliveryMethod === 'delivery')
  @IsDefined()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
