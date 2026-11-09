import { IsOptional, IsString } from 'class-validator';

/**
 * Aceita o CEP com ou sem máscara. Formato errado (ou nenhum CEP) não é 400:
 * vira `unresolved` no service, que o site já trata como "não deu pra
 * confirmar".
 */
export class CheckCepDto {
  @IsOptional()
  @IsString()
  cep?: string;
}
