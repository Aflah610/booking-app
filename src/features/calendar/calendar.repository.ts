import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { booking, bookingCalendarEvent, business, calendarBusy, calendarConnection, calendarJob, client, service, staff } from "@/db/schema";
import type { CalendarBookingDTO, CalendarConnectionDTO, ExternalBusy } from "./calendar.dto";

const PROVIDER = "google";

const connectionColumns = {
  staffId: calendarConnection.staffId,
  accountEmail: calendarConnection.accountEmail,
  calendarId: calendarConnection.calendarId,
  pushBookings: calendarConnection.pushBookings,
  blockBusy: calendarConnection.blockBusy,
  inviteClients: calendarConnection.inviteClients,
  createMeetLinks: calendarConnection.createMeetLinks,
  lastSyncedAt: calendarConnection.lastSyncedAt,
  errorCount: calendarConnection.errorCount,
  lastError: calendarConnection.lastError,
};

type ConnectionRow = Omit<CalendarConnectionDTO, "provider">;
const toDto = (r: ConnectionRow): CalendarConnectionDTO => ({ ...r, provider: PROVIDER });

export type DueJob = { bookingId: string; action: "upsert" | "delete"; attempts: number };

export function createCalendarRepository(db: Db) {
  return {
    async connection(staffId: string): Promise<(CalendarConnectionDTO & { encryptedTokens: string }) | null> {
      const [row] = await db
        .select({ ...connectionColumns, encryptedTokens: calendarConnection.encryptedTokens })
        .from(calendarConnection)
        .where(and(eq(calendarConnection.staffId, staffId), eq(calendarConnection.provider, PROVIDER)));
      return row ? { ...toDto(row), encryptedTokens: row.encryptedTokens } : null;
    },

    /** Connecting again replaces the old link and clears any earlier failure. */
    async saveConnection(staffId: string, v: { encryptedTokens: string; accountEmail: string | null }) {
      await db
        .insert(calendarConnection)
        .values({ staffId, provider: PROVIDER, ...v })
        .onConflictDoUpdate({
          target: [calendarConnection.staffId, calendarConnection.provider],
          set: { ...v, errorCount: 0, lastError: null, lastSyncedAt: null, updatedAt: new Date() },
        });
    },

    async saveTokens(staffId: string, encryptedTokens: string) {
      await db.update(calendarConnection).set({ encryptedTokens, updatedAt: new Date() }).where(eq(calendarConnection.staffId, staffId));
    },

    async setOptions(staffId: string, v: { pushBookings: boolean; blockBusy: boolean; inviteClients: boolean; createMeetLinks: boolean }) {
      await db.update(calendarConnection).set({ ...v, updatedAt: new Date() }).where(eq(calendarConnection.staffId, staffId));
      if (!v.blockBusy) await db.delete(calendarBusy).where(eq(calendarBusy.staffId, staffId));
    },

    async remove(staffId: string) {
      await db.transaction(async (tx) => {
        await tx.delete(calendarBusy).where(eq(calendarBusy.staffId, staffId));
        await tx.delete(calendarConnection).where(eq(calendarConnection.staffId, staffId));
      });
    },

    /** Connections whose busy times are older than `staleBefore` (or never fetched), skipping ones Google rejected. */
    async dueForBusySync(staleBefore: Date, maxErrors: number): Promise<CalendarConnectionDTO[]> {
      const rows = await db
        .select(connectionColumns)
        .from(calendarConnection)
        .where(
          and(
            eq(calendarConnection.blockBusy, true),
            sql`${calendarConnection.errorCount} < ${maxErrors}`,
            sql`(${calendarConnection.lastSyncedAt} is null or ${calendarConnection.lastSyncedAt} < ${staleBefore})`,
          ),
        );
      return rows.map(toDto);
    },

    /** Replaces the staff member's copied busy times with the latest from Google, all or nothing. */
    async replaceBusy(staffId: string, items: ExternalBusy[], now: Date) {
      await db.transaction(async (tx) => {
        await tx.delete(calendarBusy).where(and(eq(calendarBusy.staffId, staffId), eq(calendarBusy.provider, PROVIDER)));
        if (items.length) {
          await tx.insert(calendarBusy).values(
            // One event can be listed twice if it moves between pages; the unique index would reject the copy.
            [...new Map(items.map((i) => [i.externalId, i])).values()].map((i) => ({
              staffId,
              provider: PROVIDER,
              externalId: i.externalId,
              startsAt: i.start,
              endsAt: i.end,
            })),
          );
        }
        await tx
          .update(calendarConnection)
          .set({ lastSyncedAt: now, errorCount: 0, lastError: null })
          .where(eq(calendarConnection.staffId, staffId));
      });
    },

    async markFailed(staffId: string, error: string, permanent: boolean) {
      await db
        .update(calendarConnection)
        .set({
          lastError: error.slice(0, 500),
          // A permanent failure (access revoked) parks the connection until the person reconnects.
          errorCount: permanent ? 99 : sql`${calendarConnection.errorCount} + 1`,
        })
        .where(eq(calendarConnection.staffId, staffId));
    },

    async timezone(staffId: string): Promise<string> {
      const [row] = await db.select({ tz: staff.timezone }).from(staff).where(eq(staff.id, staffId));
      return row?.tz ?? "UTC";
    },

    async booking(bookingId: string): Promise<CalendarBookingDTO | null> {
      const [row] = await db
        .select({
          id: booking.id,
          staffId: booking.staffId,
          status: booking.status,
          slotReleased: booking.slotReleased,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          serviceName: service.name,
          location: service.location,
          clientName: client.name,
          clientPhone: client.phoneE164,
          clientEmail: client.email,
          notes: booking.notes,
          timezone: staff.timezone,
          meetEnabled: sql<boolean>`coalesce((select ${business.meetEnabled} from ${business} where ${business.id} = 1), false)`,
          meetingType: service.meetingType,
          meetingOverride: sql<"on" | "off" | null>`${booking.meetingOverride}`,
          meetingUrl: booking.meetingUrl,
          meetingSource: sql<"google" | "manual" | null>`${booking.meetingSource}`,
        })
        .from(booking)
        .innerJoin(service, eq(service.id, booking.serviceId))
        .innerJoin(client, eq(client.id, booking.clientId))
        .innerJoin(staff, eq(staff.id, booking.staffId))
        .where(eq(booking.id, bookingId));
      return row ?? null;
    },

    /** Live future bookings for one person, for catching up a calendar that was just connected. */
    async upcomingBookingIds(staffId: string, now: Date): Promise<string[]> {
      const rows = await db
        .select({ id: booking.id })
        .from(booking)
        .where(and(
            eq(booking.staffId, staffId),
            ne(booking.status, "cancelled"),
            eq(booking.slotReleased, false),
            gt(booking.endsAt, now),
            // Only bookings with no event yet: re-sending the rest would email their clients again.
            sql`not exists (select 1 from booking_calendar_event e where e.booking_id = ${booking.id} and e.provider = ${PROVIDER})`,
          ),
        );
      return rows.map((r) => r.id);
    },

    async eventId(bookingId: string): Promise<string | null> {
      const [row] = await db
        .select({ id: bookingCalendarEvent.externalEventId })
        .from(bookingCalendarEvent)
        .where(and(eq(bookingCalendarEvent.bookingId, bookingId), eq(bookingCalendarEvent.provider, PROVIDER)));
      return row?.id ?? null;
    },

    async saveEventId(bookingId: string, externalEventId: string) {
      await db
        .insert(bookingCalendarEvent)
        .values({ bookingId, provider: PROVIDER, externalEventId })
        .onConflictDoUpdate({ target: [bookingCalendarEvent.bookingId, bookingCalendarEvent.provider], set: { externalEventId } });
    },

    async removeEventId(bookingId: string) {
      await db.delete(bookingCalendarEvent).where(and(eq(bookingCalendarEvent.bookingId, bookingId), eq(bookingCalendarEvent.provider, PROVIDER)));
    },

    /** The Google-made link for a booking, once Google has it. A pasted link is never touched. */
    async saveGoogleMeeting(bookingId: string, url: string) {
      await db
        .update(booking)
        .set({ meetingUrl: url, meetingSource: "google" })
        .where(and(eq(booking.id, bookingId), sql`${booking.meetingSource} is distinct from 'manual'`));
    },

    async clearGoogleMeeting(bookingId: string) {
      await db
        .update(booking)
        .set({ meetingUrl: null, meetingSource: null })
        .where(and(eq(booking.id, bookingId), eq(booking.meetingSource, "google")));
    },

    /**
     * A booking moved to another time with the same therapist keeps its Google event (and so its Meet link): the event
     * and the meeting details follow it to the new booking. Returns false when the therapist changed, where the old
     * event has to be removed from their calendar and a new one made.
     */
    async moveEvent(fromBookingId: string, toBookingId: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        const rows = await tx.select({ id: booking.id, staffId: booking.staffId, url: booking.meetingUrl, source: booking.meetingSource, override: booking.meetingOverride }).from(booking).where(inArray(booking.id, [fromBookingId, toBookingId]));
        const from = rows.find((r) => r.id === fromBookingId);
        const to = rows.find((r) => r.id === toBookingId);
        if (!from || !to || from.staffId !== to.staffId) return false;
        await tx.update(bookingCalendarEvent).set({ bookingId: toBookingId }).where(and(eq(bookingCalendarEvent.bookingId, fromBookingId), eq(bookingCalendarEvent.provider, PROVIDER)));
        await tx.update(booking).set({ meetingUrl: from.url, meetingSource: from.source, meetingOverride: from.override }).where(eq(booking.id, toBookingId));
        return true;
      });
    },

    /** Queues a calendar write; a newer request for the same booking replaces the pending one. */
    async enqueue(jobs: { bookingId: string; action: "upsert" | "delete" }[], runAt: Date) {
      if (!jobs.length) return;
      await db
        .insert(calendarJob)
        .values(jobs.map((j) => ({ ...j, runAt })))
        .onConflictDoUpdate({
          target: calendarJob.bookingId,
          set: { action: sql`excluded.action`, runAt, attempts: 0, lastError: null },
        });
    },

    /** Takes due jobs and pushes their run time out by `leaseMin`, so a crashed worker's jobs come back later. */
    async claimDue(now: Date, limit: number, leaseMin: number): Promise<DueJob[]> {
      const lease = new Date(now.getTime() + leaseMin * 60_000);
      const result = await db.execute<{ booking_id: string; action: "upsert" | "delete"; attempts: number }>(sql`
        update calendar_job set attempts = attempts + 1, run_at = ${lease}
        where booking_id in (
          select booking_id from calendar_job where run_at <= ${now} order by run_at limit ${limit} for update skip locked
        )
        returning booking_id, action, attempts`);
      return result.rows.map((r) => ({ bookingId: r.booking_id, action: r.action, attempts: r.attempts }));
    },

    /** Done. Only removes the job if nobody queued something newer meanwhile (which resets `attempts`). */
    async finish(job: DueJob) {
      await db.delete(calendarJob).where(and(eq(calendarJob.bookingId, job.bookingId), eq(calendarJob.attempts, job.attempts)));
    },

    async retryAt(job: DueJob, at: Date, error: string) {
      await db
        .update(calendarJob)
        .set({ runAt: at, lastError: error.slice(0, 500) })
        .where(and(eq(calendarJob.bookingId, job.bookingId), eq(calendarJob.attempts, job.attempts)));
    },

    async dropJobs(bookingIds: string[]) {
      if (bookingIds.length) await db.delete(calendarJob).where(inArray(calendarJob.bookingId, bookingIds));
    },
  };
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
