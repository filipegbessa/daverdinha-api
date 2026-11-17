import { IsString, MaxLength } from 'class-validator';

export class CustomerByPhoneDto {
  /** Como estiver: `5521984448130`, `(21) 98444-8130`... */
  @IsString()
  @MaxLength(30)
  phone: string;
}
