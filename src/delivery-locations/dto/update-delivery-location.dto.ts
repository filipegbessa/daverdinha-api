import { IsBoolean } from 'class-validator';

export class UpdateDeliveryLocationDto {
  @IsBoolean()
  covered: boolean;
}
