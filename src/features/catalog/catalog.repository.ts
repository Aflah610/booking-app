import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { service } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { ServiceDTO } from "./catalog.dto";
import type { ServiceData } from "./catalog.schemas";

const columns = {
  id: service.id,
  name: service.name,
  description: service.description,
  durationMin: service.durationMin,
  bufferBeforeMin: service.bufferBeforeMin,
  bufferAfterMin: service.bufferAfterMin,
  priceDisplay: service.priceDisplay,
  pricePaise: service.pricePaise,
  slotIntervalMin: service.slotIntervalMin,
  minNoticeMin: service.minNoticeMin,
  maxNoticeDays: service.maxNoticeDays,
  maxPerDay: service.maxPerDay,
  location: service.location,
  questions: service.questions,
  active: service.active,
};

export function createCatalogRepository(db: Db) {
  return {
    async findById(id: string): Promise<ServiceDTO | null> {
      const [row] = await db.select(columns).from(service).where(eq(service.id, id));
      return row ?? null;
    },

    list({ activeOnly = false } = {}): Promise<ServiceDTO[]> {
      const q = db.select(columns).from(service);
      return (activeOnly ? q.where(eq(service.active, true)) : q).orderBy(asc(service.name));
    },

    create(data: ServiceData & { pricePaise: number | null }, audit: Omit<AuditEntry, "entityId">): Promise<ServiceDTO> {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(service).values(data).returning(columns);
        await writeAudit(tx, { ...audit, entityId: row.id });
        return row;
      });
    },

    update(id: string, data: Partial<ServiceData> & { pricePaise?: number | null }, audit: AuditEntry): Promise<ServiceDTO | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(service).set(data).where(eq(service.id, id)).returning(columns);
        if (row) await writeAudit(tx, audit);
        return row ?? null;
      });
    },
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
