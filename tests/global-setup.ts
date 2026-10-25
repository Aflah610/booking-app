import { execFileSync } from "node:child_process";

// Tests run against a real Postgres (see README). Migrations are applied fresh each run.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5433/booking_test";
  process.env.DATABASE_URL = url;
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
