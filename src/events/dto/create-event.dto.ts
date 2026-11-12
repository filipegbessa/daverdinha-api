import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { emptyToNull, toBoolean, trim } from '../../common/transforms';

/** Número de form: vazio vira `null` (gratuito, sem limite de vagas). */
const toNullableNumber = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === 'null' ? null : Number(value);

/**
 * Chega como `multipart/form-data` (por causa da foto), então tudo vem como
 * string. Campo opcional enviado vazio vira `null`, e `null` tem significado
 * (decisão 5 do plano da agenda): `price` = gratuito, `spots` = sem limite,
 * `locationName` = no ateliê.
 */
export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  /** ISO 8601 com fuso (o admin manda em UTC). */
  @IsISO8601({ strict: true })
  startsAt: string;

  /** Opcional: sem fim, o evento sai da lista no fim do dia em que começa. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({ strict: true })
  endsAt?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  locationName?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  locationAddress?: string | null;

  @IsOptional()
  @Transform(toNullableNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @IsOptional()
  @Transform(toNullableNumber)
  @IsInt()
  @Min(1)
  spots?: number | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  published?: boolean;

  /**
   * Venda/inscrição pelo site ("Comprar ingresso" se pago, "Inscrever-se" se
   * gratuito). Só vale com o interruptor "Venda de ingressos" do Dashboard.
   */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  ticketSales?: boolean;

  /** Máximo de ingressos numa compra. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  maxTicketsPerOrder?: number;
}
