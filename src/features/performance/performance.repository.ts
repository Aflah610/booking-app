import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { booking, client, service, staff } from "@/db/schema";
import type { SessionFact, SessionLabel } from "./performance.dto";

export type TherapistRow = { id: string; name: string; designation: string | null };

export function createPerformanceRepository(db: Db) {
  return {
    /**
     * Every booking that counts toward someone's treatment. A client's Nth session needs their whole history with that therapist,
     * so this is not limited to the window; the calculator trims it. Cancelled bookings (a moved session's original too),
     * no-shows and slots given back after a failed payment are left out.
     */
    async sessionFacts(staffId?: string): Promise<SessionFact[]> {
      const rows = await db
        .select({ id: booking.id, staffId: booking.staffId, clientId: booking.clientId, startsAt: booking.startsAt, endsAt: booking.endsAt, status: booking.status })
        .from(booking)
        .where(and(inArray(booking.status, ["upcoming", "completed"]), eq(booking.slotReleased, false), staffId ? eq(booking.staffId, staffId) : undefined));
      return rows.map((r) => ({ ...r, status: r.status === "completed" ? "completed" : "upcoming" }));
    },

    /** Client and service names for the given bookings, for the sessions listed on a therapist's page. */
    async sessionLabels(bookingIds: string[]): Promise<Map<string, SessionLabel>> {
      if (bookingIds.length === 0) return new Map();
      const rows = await db
        .select({ id: booking.id, number: booking.number, clientId: client.id, clientName: client.name, clientPhone: client.phoneE164, serviceName: service.name })
        .from(booking)
        .innerJoin(client, eq(client.id, booking.clientId))
        .innerJoin(service, eq(service.id, booking.serviceId))
        .where(inArray(booking.id, bookingIds));
      return new Map(rows.map(({ id, ...label }) => [id, label]));
    },

    async therapists(ids: string[]): Promise<TherapistRow[]> {
      if (ids.length === 0) return [];
      return db.select({ id: staff.id, name: staff.name, designation: staff.designation }).from(staff).where(inArray(staff.id, ids));
    },
  };
}

export type PerformanceRepository = ReturnType<typeof createPerformanceRepository>;
