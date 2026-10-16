// Applies pending migrations from ./drizzle. Bundled to dist/migrate.cjs for the Docker image.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { poolConfig } from "../src/db/pool-config";

async function main() {
  // Neon's pooled URL goes through PgBouncer in transaction mode, which can break migrations;
  // use the direct URL when the host provides one.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool(poolConfig(url, 1));
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle"),
    });
    console.log("Migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
