import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateDeliveryLocationDto {
  @IsString()
  zone: string;

  @IsString()
  regionName: string;

  @IsBoolean()
  @IsOptional()
  covered?: boolean;
}
