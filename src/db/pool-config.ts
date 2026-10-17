import type { PoolConfig } from "pg";

/**
 * Some host consoles (Zoho Catalyst) reject `?` and `&` in environment values, so a Neon URL may arrive
 * without `?sslmode=require`. Neon refuses plain connections, so TLS is switched on for its hosts, or
 * for any host when DATABASE_SSL=true. An explicit sslmode in the URL always wins.
 */
export function poolConfig(connectionString: string, max: number, env: Record<string, string | undefined> = process.env): PoolConfig {
  const url = new URL(connectionString);
  // node-postgres already treats these modes as verify-full and warns on every connection. Saying so keeps
  // the same checks and silences the warning (and stays safe if a later version changes what they mean).
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
    connectionString = url.toString();
  }
  const wantsTls =
    !url.searchParams.has("sslmode") && (url.hostname.endsWith(".neon.tech") || env.DATABASE_SSL === "true");
  // Idle connections are let go quickly (a serverless function may be frozen for minutes) and a slow database fails fast.
  const common = { connectionString, max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, keepAlive: true };
  return wantsTls ? { ...common, ssl: { rejectUnauthorized: true } } : common;
}
