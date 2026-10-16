import { asc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db";
import { holiday } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import { PG_UNIQUE_VIOLATION, pgError } from "@/features/shared/db-errors";

export type HolidayDTO = { id: string; date: string; name: string };
const columns = { id: holiday.id, date: holiday.date, name: holiday.name };

export function createHolidaysRepository(db: Db) {
  return {
    /** From `fromDate` onwards, soonest first. */
    list(fromDate: string): Promise<HolidayDTO[]> {
      return db.select(columns).from(holiday).where(gte(holiday.date, fromDate)).orderBy(asc(holiday.date));
    },

    /** False when that date already has a holiday. */
    async add(data: { date: string; name: string }, audit: Omit<AuditEntry, "entityId">): Promise<HolidayDTO | null> {
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx.insert(holiday).values(data).returning(columns);
          await writeAudit(tx, { ...audit, entityId: row.id });
          return row;
        });
      } catch (err) {
        if (pgError(err)?.code === PG_UNIQUE_VIOLATION) return null;
        throw err;
      }
    },

    remove(id: string, audit: AuditEntry): Promise<boolean> {
      return db.transaction(async (tx) => {
        const rows = await tx.delete(holiday).where(eq(holiday.id, id)).returning({ id: holiday.id });
        if (rows.length) await writeAudit(tx, audit);
        return rows.length > 0;
      });
    },
  };
}

export type HolidaysRepository = ReturnType<typeof createHolidaysRepository>;
