import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateDeliveryLocationDto {
  @IsString()
  zona: string;

  @IsString()
  nomeRegiao: string;

  @IsBoolean()
  @IsOptional()
  atendida?: boolean;
}
