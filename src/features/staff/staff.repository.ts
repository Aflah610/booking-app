import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { service, staff, staffService } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { PublicStaffDTO, StaffDTO } from "./staff.dto";
import type { StaffData } from "./staff.schemas";

const columns = {
  id: staff.id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  timezone: staff.timezone,
  active: staff.active,
};

export function createStaffRepository(db: Db) {
  return {
    async findById(id: string): Promise<StaffDTO | null> {
      const [row] = await db.select(columns).from(staff).where(eq(staff.id, id));
      return row ?? null;
    },

    async findByEmail(email: string): Promise<StaffDTO | null> {
      const [row] = await db
        .select(columns)
        .from(staff)
        .where(sql`lower(${staff.email}) = ${email.trim().toLowerCase()}`);
      return row ?? null;
    },

    list(): Promise<StaffDTO[]> {
      return db.select(columns).from(staff).orderBy(asc(staff.name));
    },

    create(data: StaffData, audit: Omit<AuditEntry, "entityId">): Promise<StaffDTO> {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(staff).values(data).returning(columns);
        await writeAudit(tx, { ...audit, entityId: row.id });
        return row;
      });
    },

    update(id: string, data: Partial<StaffData>, audit: AuditEntry): Promise<StaffDTO | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(staff).set(data).where(eq(staff.id, id)).returning(columns);
        if (row) await writeAudit(tx, audit);
        return row ?? null;
      });
    },

    async serviceIds(staffId: string): Promise<string[]> {
      const rows = await db
        .select({ id: staffService.serviceId })
        .from(staffService)
        .where(eq(staffService.staffId, staffId));
      return rows.map((r) => r.id);
    },

    async replaceServices(staffId: string, serviceIds: string[], audit: AuditEntry) {
      await db.transaction(async (tx) => {
        // Services that stay keep their row, and with it this person's own price.
        await tx
          .delete(staffService)
          .where(serviceIds.length ? and(eq(staffService.staffId, staffId), notInArray(staffService.serviceId, serviceIds)) : eq(staffService.staffId, staffId));
        if (serviceIds.length) {
          await tx.insert(staffService).values(serviceIds.map((serviceId) => ({ staffId, serviceId }))).onConflictDoNothing();
        }
        await writeAudit(tx, audit);
      });
    },

    /** This person's own price (paise) for each service they offer; absent or null = the service's price. */
    async servicePrices(staffId: string): Promise<Record<string, number | null>> {
      const rows = await db
        .select({ id: staffService.serviceId, price: staffService.pricePaise })
        .from(staffService)
        .where(eq(staffService.staffId, staffId));
      return Object.fromEntries(rows.map((r) => [r.id, r.price]));
    },

    async setServicePrices(staffId: string, prices: Record<string, number | null>, audit: AuditEntry) {
      await db.transaction(async (tx) => {
        for (const [serviceId, pricePaise] of Object.entries(prices)) {
          await tx.update(staffService).set({ pricePaise }).where(and(eq(staffService.staffId, staffId), eq(staffService.serviceId, serviceId)));
        }
        await writeAudit(tx, audit);
      });
    },

    /** Active staff offering an active service. */
    listBookableForService(serviceId: string): Promise<PublicStaffDTO[]> {
      return db
        .select({ id: staff.id, name: staff.name, timezone: staff.timezone })
        .from(staffService)
        .innerJoin(staff, eq(staff.id, staffService.staffId))
        .innerJoin(service, eq(service.id, staffService.serviceId))
        .where(sql`${staffService.serviceId} = ${serviceId} and ${staff.active} and ${service.active}`)
        .orderBy(asc(staff.name));
    },
  };
}

export type StaffRepository = ReturnType<typeof createStaffRepository>;
