import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * Nome e sobrenome: pelo menos duas palavras com letra. O checkout do
 * Pagar.me (Stone) exige o nome completo do comprador.
 */
export const FULL_NAME = /^\S*\p{L}\S*(?:\s+\S*\p{L}\S*)+$/u;

/** Tira as pontas e junta espaços repetidos, pro nome sair limpo no Pagar.me. */
const collapseSpaces = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/**
 * Quem compra. Reaproveitado pela compra de ingresso. Nome e e-mail seguem o
 * limite do Pagar.me pro comprador do link de pagamento (64 caracteres cada):
 * acima disso o link não é criado e o pedido cai, então a API recusa antes.
 * Números literais porque o plugin do OpenAPI não lê constantes.
 */
export class CustomerDto {
  @Transform(collapseSpaces)
  @IsString()
  @Length(2, 64)
  @Matches(FULL_NAME, { message: 'Informe nome e sobrenome.' })
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

  /**
   * CPF ou CNPJ, com ou sem máscara (passaporte também passa, pra quem não
   * tem documento brasileiro, mas não é anunciado no formulário). Opcional:
   * sem ele, o comprador preenche na própria página do Pagar.me. Só a forma é
   * checada aqui; o dígito verificador e a classificação do tipo ficam em
   * `parseDocument` (`src/common/document.ts`), chamado pelo service.
   */
  @IsOptional()
  @IsString()
  @Length(5, 32)
  document?: string;
}
