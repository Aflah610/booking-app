import { sql } from "drizzle-orm";
import type { Db } from "@/db";

export function createHealthRepository(db: Db) {
  return {
    async databaseReachable(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
