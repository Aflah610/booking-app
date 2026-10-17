import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { staffPreference } from "@/db/schema";

/** Per-person screen settings (like which columns a list shows). The repository only stores; screens decide what a value means. */
export function createPreferencesRepository(db: Db) {
  return {
    async get(staffId: string, key: string): Promise<unknown | null> {
      const [row] = await db
        .select({ value: staffPreference.value })
        .from(staffPreference)
        .where(and(eq(staffPreference.staffId, staffId), eq(staffPreference.key, key)));
      return row ? row.value : null;
    },

    async set(staffId: string, key: string, value: unknown) {
      await db
        .insert(staffPreference)
        .values({ staffId, key, value })
        .onConflictDoUpdate({ target: [staffPreference.staffId, staffPreference.key], set: { value, updatedAt: new Date() } });
    },

    async remove(staffId: string, key: string) {
      await db.delete(staffPreference).where(and(eq(staffPreference.staffId, staffId), eq(staffPreference.key, key)));
    },
  };
}

export type PreferencesRepository = ReturnType<typeof createPreferencesRepository>;
