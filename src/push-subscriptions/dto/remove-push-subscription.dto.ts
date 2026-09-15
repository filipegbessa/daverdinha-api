import { IsNotEmpty, IsString } from 'class-validator';

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
