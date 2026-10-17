import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { poolConfig } from "./pool-config";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(connectionString: string) {
  const pool = new Pool(poolConfig(connectionString, 10));
  // A connection the database dropped while idle (Neon does this) emits an error on the pool. Unhandled, that would crash the
  // process; handled, the pool simply discards the broken connection and opens a new one next time.
  pool.on("error", (err) => console.error("Database connection dropped while idle", err.message));
  return drizzle(pool, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { db?: Db };

/** Lazily created so builds and tests don't need DATABASE_URL at import time. */
export function getDb(): Db {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.db = createDb(url);
  }
  return globalForDb.db;
}

export { schema };
