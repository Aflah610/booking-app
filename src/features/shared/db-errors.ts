/** Postgres error code and constraint name, looking through Drizzle's wrapper error. */
export function pgError(err: unknown): { code?: string; constraint?: string } {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    const x = e as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof x.code === "string") return { code: x.code, constraint: typeof x.constraint === "string" ? x.constraint : undefined };
    e = x.cause;
  }
  return {};
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_EXCLUSION_VIOLATION = "23P01";
