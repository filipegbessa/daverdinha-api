import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../common/transforms';
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
}
