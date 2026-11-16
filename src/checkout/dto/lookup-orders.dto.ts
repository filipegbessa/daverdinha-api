import { IsEmail, MaxLength } from 'class-validator';

export class LookupOrdersDto {
  // O mesmo limite do checkout (Pagar.me): um e-mail maior não tem pedido.
  @IsEmail()
  @MaxLength(64)
  email: string;
}
