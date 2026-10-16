import type { PoolConfig } from "pg";

/**
 * Some host consoles (Zoho Catalyst) reject `?` and `&` in environment values, so a Neon URL may arrive
 * without `?sslmode=require`. Neon refuses plain connections, so TLS is switched on for its hosts, or
 * for any host when DATABASE_SSL=true. An explicit sslmode in the URL always wins.
 */
export function poolConfig(connectionString: string, max: number, env: Record<string, string | undefined> = process.env): PoolConfig {
  const url = new URL(connectionString);
  const wantsTls =
    !url.searchParams.has("sslmode") && (url.hostname.endsWith(".neon.tech") || env.DATABASE_SSL === "true");
  return wantsTls ? { connectionString, max, ssl: { rejectUnauthorized: true } } : { connectionString, max };
}
