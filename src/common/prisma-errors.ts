type PrismaLikeError = { code?: string; meta?: { target?: unknown } };

/** P2002 numa coluna específica — `name` duplicado é erro do usuário, `slug` duplicado é corrida. */
export function isUniqueViolation(error: unknown, field: string): boolean {
  const { code, meta } = (error ?? {}) as PrismaLikeError;
  if (code !== 'P2002') return false;
  const target = meta?.target;
  return Array.isArray(target)
    ? target.includes(field)
    : String(target).includes(field);
}

/** P2003: a linha ainda é referenciada por outra (ex.: categoria com produtos). */
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as PrismaLikeError | undefined)?.code === 'P2003';
}
