import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { emptyToNull } from '../../common/transforms';

/** Código sempre em maiúsculas e sem espaço: o comprador digita de qualquer jeito. */
export const normalizeCode = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * Cadastro de cupom (JSON). As regras que dependem de mais de um campo
 * (porcentagem de 1 a 100, escopo com a lista, fim depois do início) ficam
 * no `CouponsService`. Números literais: o plugin do OpenAPI não lê constantes.
 */
export class CreateCouponDto {
  /** 3 a 30 letras, números, "-" ou "_". */
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/, {
    message: 'Use de 3 a 30 letras, números, "-" ou "_", sem espaço.',
  })
  code: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsIn(['percent', 'fixed', 'free_shipping'])
  type: 'percent' | 'fixed' | 'free_shipping';

  /** Porcentagem (1–100) ou reais; vazio no frete grátis. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999)
  value?: number | null;

  /** Teto do desconto em reais (só na porcentagem). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999)
  maxDiscount?: number | null;

  @IsIn(['order', 'categories', 'products', 'events'])
  scope: 'order' | 'categories' | 'products' | 'events';

  /** "Acima de": valor mínimo dos itens elegíveis. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999)
  minSubtotal?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  startsAt?: string | null;

  /** Exclusivo: no instante do fim o cupom já não vale. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  endsAt?: string | null;

  /** Limite total de usos; vazio = sem limite. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUses?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  productIds?: string[];

  /** Vazio no escopo "events" = todos os eventos. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  eventIds?: string[];
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class ListCouponsDto extends PaginationQueryDto {
  /** Parte do código ou da descrição. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}
