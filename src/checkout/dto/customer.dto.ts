import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

/** Quem compra. Reaproveitado pela compra de ingresso. */
export class CustomerDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  /** Com ou sem máscara e código do país: 10 a 13 dígitos. Gravado normalizado (`5521…`). */
  @IsString()
  @MaxLength(30)
  @Matches(/^(?:\D*\d){10,13}\D*$/, {
    message: 'phone deve ter de 10 a 13 dígitos',
  })
  phone: string;
}
