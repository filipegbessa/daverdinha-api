import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDeliveryAreaDto {
  /** Uma das zonas que já existem nos bairros (`DeliveryLocation.zone`). */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  zone: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  /** Valor da entrega pra qualquer bairro da área, em reais. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999)
  fee: number;
}
