import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * Quem compra. Reaproveitado pela compra de ingresso. Nome e e-mail seguem o
 * limite do Pagar.me pro comprador do link de pagamento (64 caracteres cada):
 * acima disso o link não é criado e o pedido cai, então a API recusa antes.
 * Números literais porque o plugin do OpenAPI não lê constantes.
 */
export class CustomerDto {
  @IsString()
  @Length(2, 64)
  name: string;

  @IsEmail()
  @MaxLength(64)
  email: string;

  /** Com ou sem máscara e código do país: 10 a 13 dígitos. Gravado normalizado (`5521…`). */
  @IsString()
  @MaxLength(30)
  @Matches(/^(?:\D*\d){10,13}\D*$/, {
    message: 'phone deve ter de 10 a 13 dígitos',
  })
  phone: string;
}
