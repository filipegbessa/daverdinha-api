import { IsEmail, MaxLength } from 'class-validator';

export class LookupOrdersDto {
  @IsEmail()
  @MaxLength(200)
  email: string;
}
