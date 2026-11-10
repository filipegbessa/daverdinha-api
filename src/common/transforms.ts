/**
 * Funções pro `@Transform` do class-transformer, usadas nos DTOs. Ficam aqui
 * pra todo DTO tratar espaço, campo vazio e booleano de form do mesmo jeito.
 */
type TransformArgs = { value: unknown };

/** Tira espaço das pontas: `" Vasos"` e `"Vasos"` são o mesmo nome no unique. */
export const trim = ({ value }: TransformArgs) =>
  typeof value === 'string' ? value.trim() : value;

/** Texto opcional: vazio (ou só espaço) vira `null`, o resto sai aparado. */
export const emptyToNull = ({ value }: TransformArgs) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

/**
 * Booleano de form ou query, que chega como string. `@Type(() => Boolean)`
 * não serve: `Boolean('false')` é `true`. Qualquer coisa além de `true`/`"true"` é `false`.
 */
export const toBoolean = ({ value }: TransformArgs) =>
  value === true || value === 'true';

/** Como `toBoolean`, mas o que não for `true`/`false` some (filtro não aplicado). */
export const toOptionalBoolean = ({ value }: TransformArgs) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : undefined;

/** Inteiro de form: campo vazio vira `null` (ex.: "sob encomenda", prazo limpo). */
export const toNullableInt = ({ value }: TransformArgs) =>
  value === '' || value === null || value === 'null' ? null : Number(value);
