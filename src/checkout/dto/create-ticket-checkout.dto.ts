import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../common/transforms';
import { normalizeCode } from '../../coupons/dto/coupon.dto';
import { CustomerDto } from './customer.dto';

export class AttendeeDto {
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name: string;
}

/**
 * Compra de ingresso (ou inscrição gratuita) na página do evento. Um evento
 * por pedido, sem carrinho nem entrega; preço e vagas vêm do banco.
 */
export class CreateTicketCheckoutDto {
  @IsUUID()
  eventId: string;

  /** Um nome por ingresso. 50 é o teto técnico; o limite real é o do evento. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees: AttendeeDto[];

  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Código do cupom de evento; inválido é 422. */
  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @MaxLength(30)
  couponCode?: string;
}

/** `POST /checkout/tickets/quote`: o total da compra de ingresso, com o cupom. */
export class TicketQuoteDto {
  @IsUUID()
  eventId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @MaxLength(30)
  couponCode?: string;
}
