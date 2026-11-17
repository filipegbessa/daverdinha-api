export type DocumentType = 'CPF' | 'CNPJ' | 'PASSPORT';

export interface ParsedDocument {
  type: DocumentType;
  value: string;
}

/**
 * Classifica e valida o documento do comprador pro Pagar.me
 * (`customer_settings.customer.document`/`document_type`): CPF (11 dígitos),
 * CNPJ (14 dígitos) com dígito verificador, ou passaporte (alfanumérico, 5 a
 * 20 caracteres) pra quem não tem documento brasileiro. `null` pro que não é
 * nenhum dos três — sequências repetidas (`00000000000`) são recusadas
 * mesmo passando pela conta, porque não existem de verdade.
 */
export function parseDocument(raw: string): ParsedDocument | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11)
    return isValidCpf(digits) ? { type: 'CPF', value: digits } : null;
  if (digits.length === 14)
    return isValidCnpj(digits) ? { type: 'CNPJ', value: digits } : null;

  // Exige ao menos uma letra: CPF/CNPJ só têm dígito, então um número de
  // tamanho errado (ex. "12312") não deve colar como passaporte.
  const passport = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^(?=.*[A-Z])[A-Z0-9]{5,20}$/.test(passport)
    ? { type: 'PASSPORT', value: passport }
    : null;
}

function isValidCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    const sum = sumWeighted(cpf, length, length + 1);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function isValidCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digit = (length: number, weights: number[]) => {
    const sum = weights.reduce(
      (acc, weight, i) => acc + Number(cnpj[i]) * weight,
      0,
    );
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return (
    digit(12, weights1) === Number(cnpj[12]) &&
    digit(13, weights2) === Number(cnpj[13])
  );
}

/** Soma `cpf[0..length-1]` com pesos decrescentes a partir de `startWeight`. */
function sumWeighted(cpf: string, length: number, startWeight: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (startWeight - i);
  return sum;
}
