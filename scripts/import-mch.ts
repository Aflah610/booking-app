// Copies clients and case histories from MCH. Usage:
//   tsx scripts/import-mch.ts mch-export.json --fallback-author you@firm.com [--staff "MCH name=staff@email"]... [--commit]
// Without --commit it only counts (everything is rolled back). Prints counts and MCH codes, never clinical text.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { importMch, type MchExport } from "../src/features/mch-import/mch-import";

async function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  const flag = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
  const [fallbackEmail] = flag("--fallback-author");
  if (!file || !fallbackEmail) throw new Error("Usage: import-mch.ts <export.json> --fallback-author <staff email> [--staff 'MCH name=staff email'] [--commit]");
  const db = getDb();
  const byEmail = async (email: string) => {
    const [s] = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.email, email.trim().toLowerCase()));
    if (!s) throw new Error(`No staff member with email ${email}`);
    return s.id;
  };
  const staffByName: Record<string, string> = {};
  for (const pair of flag("--staff")) {
    const [name, email] = pair.split("=");
    staffByName[name] = await byEmail(email);
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as MchExport;
  const dryRun = !args.includes("--commit");
  const report = await importMch(db, data, { fallbackAuthorId: await byEmail(fallbackEmail), staffByName, dryRun });
  console.log(JSON.stringify({ mode: dryRun ? "dry run (nothing saved)" : "saved", in: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])), ...report }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
