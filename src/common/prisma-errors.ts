type PrismaLikeError = { code?: string; meta?: { target?: unknown } };

/**
 * P2002. Com `field`, só conta se a violação foi naquela coluna — `name`
 * duplicado é erro do usuário, `slug` duplicado é corrida. Sem `field`,
 * qualquer unique serve (ex.: a tabela só tem uma chave única).
 */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  const { code, meta } = (error ?? {}) as PrismaLikeError;
  if (code !== 'P2002') return false;
  if (field === undefined) return true;
  const target = meta?.target;
  return Array.isArray(target)
    ? target.includes(field)
    : String(target).includes(field);
}

/** P2003: a linha ainda é referenciada por outra (ex.: categoria com produtos), ou aponta pra uma que não existe. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as PrismaLikeError | undefined)?.code === 'P2003';
}

/** P2025: o `update`/`delete` não achou a linha. */
export function isRecordNotFound(error: unknown): boolean {
  return (error as PrismaLikeError | undefined)?.code === 'P2025';
}
