import { DomainError } from "@/features/shared/errors";
import type { BookingEvent } from "@/features/bookings/bookings.dto";
import { BUSY_REFRESH_MIN, BUSY_WINDOW_DAYS, type CalendarStatusDTO, type CalendarTokens } from "./calendar.dto";
import type { CalendarRepository, DueJob } from "./calendar.repository";
import { decrypt, encrypt, readState, signState } from "./crypto";
import { ProviderAuthError, type CalendarProvider } from "./provider";

/** Transient failures (Google down, network) are retried this many times before the job is dropped. */
const MAX_JOB_ATTEMPTS = 8;
/** A connection whose busy refresh keeps failing is left alone until the person presses "Sync now" or reconnects. */
const MAX_SYNC_ERRORS = 5;
const JOB_LEASE_MIN = 5;

const backoffMin = (attempts: number) => Math.min(2 ** attempts, 60);
const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Keeps each staff member's Google Calendar and the booking app in step, in both directions:
 *  - their bookings are written into their calendar (and moved or removed when the booking changes);
 *  - events already in their calendar block those hours from being booked.
 * Neither direction can fail a booking: writes go through a retrying queue, and busy times are read from a copy.
 */
export function createCalendarService(deps: {
  calendarRepo: CalendarRepository;
  provider: CalendarProvider;
  /** Public address of this app; Google sends people back to `<appUrl>/api/calendar/google/callback`. */
  appUrl: string;
  /** Encrypts stored tokens and signs the connect `state`. */
  secret: string | undefined;
}) {
  const { calendarRepo, provider, appUrl } = deps;
  const redirectUri = `${appUrl}/api/calendar/google/callback`;

  function secret(): string {
    if (!deps.secret) throw new DomainError("invalid", "Set CALENDAR_ENCRYPTION_KEY or AUTH_SECRET to store calendar connections");
    return deps.secret;
  }

  function requireConfigured() {
    if (!provider.configured()) {
      throw new DomainError("invalid", "Google Calendar is not set up: add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET");
    }
  }

  async function connectionOf(staffId: string) {
    const conn = await calendarRepo.connection(staffId);
    if (!conn) throw new DomainError("not_found", `Staff member ${staffId} has no Google Calendar connected`);
    return conn;
  }

  /** A usable access token for this person, refreshed (and the new one stored) when it is about to expire. */
  async function accessToken(conn: { staffId: string; encryptedTokens: string }, now: Date): Promise<string> {
    let tokens: CalendarTokens;
    try {
      tokens = JSON.parse(decrypt(conn.encryptedTokens, secret())) as CalendarTokens;
    } catch {
      throw new ProviderAuthError("Stored calendar tokens can't be read (the secret changed); reconnect Google Calendar");
    }
    if (tokens.accessExpiresAt - now.getTime() > 60_000) return tokens.accessToken;
    const fresh = await provider.refresh(tokens.refreshToken);
    tokens = { ...tokens, ...fresh };
    await calendarRepo.saveTokens(conn.staffId, encrypt(JSON.stringify(tokens), secret()));
    return tokens.accessToken;
  }

  async function backfill(staffId: string, now: Date) {
    const ids = await calendarRepo.upcomingBookingIds(staffId, now);
    await calendarRepo.enqueue(ids.map((bookingId) => ({ bookingId, action: "upsert" as const })), now);
  }

  async function status(staffId: string): Promise<CalendarStatusDTO> {
    const conn = await calendarRepo.connection(staffId);
    if (!conn) return { providerConfigured: provider.configured(), connection: null };
    const { encryptedTokens: _hidden, ...connection } = conn;
    return { providerConfigured: provider.configured(), connection };
  }

  /** Where to send the person to approve access. */
  function connectUrl(staffId: string, now = new Date()): string {
    requireConfigured();
    return provider.authUrl(signState(staffId, secret(), now), redirectUri);
  }

  /** Whose connect request this `state` belongs to, so the callback can check the signed-in person may act for them. */
  function stateOwner(state: string, now = new Date()): string | null {
    return readState(state, secret(), now);
  }

  /** Handles Google's redirect back. Returns whose calendar was connected. */
  async function completeConnect(code: string, state: string, now = new Date()): Promise<string> {
    requireConfigured();
    const staffId = readState(state, secret(), now);
    if (!staffId) throw new DomainError("invalid", "This connect link has expired or is not valid; start again from your availability page");
    let tokens;
    try {
      tokens = await provider.exchangeCode(code, redirectUri);
    } catch (err) {
      throw new DomainError("invalid", `Google did not accept the connection: ${reason(err)}`);
    }
    const { accountEmail, ...secrets } = tokens;
    await calendarRepo.saveConnection(staffId, { encryptedTokens: encrypt(JSON.stringify(secrets satisfies CalendarTokens), secret()), accountEmail });
    await backfill(staffId, now);
    return staffId;
  }

  async function disconnect(staffId: string) {
    const conn = await calendarRepo.connection(staffId);
    if (!conn) return;
    // Revoking is a courtesy so the app disappears from the person's Google account; it must not block disconnecting.
    try {
      const tokens = JSON.parse(decrypt(conn.encryptedTokens, secret())) as CalendarTokens;
      await provider.revoke(tokens.refreshToken);
    } catch {
      // Already revoked or unreadable: nothing more to clean up on Google's side.
    }
    await calendarRepo.remove(staffId);
  }

  async function setOptions(staffId: string, options: { pushBookings: boolean; blockBusy: boolean }, now = new Date()) {
    const conn = await connectionOf(staffId);
    await calendarRepo.setOptions(staffId, options);
    if (options.pushBookings && !conn.pushBookings) await backfill(staffId, now);
  }

  /** Called for every booking change. Best effort, like workflows: it must never fail the booking. */
  async function onBookingEvent(event: BookingEvent) {
    if (!provider.configured()) return;
    const upsert = (bookingId: string) => ({ bookingId, action: "upsert" as const });
    const remove = (bookingId: string) => ({ bookingId, action: "delete" as const });
    switch (event.type) {
      case "booked":
      case "payment_success":
        return calendarRepo.enqueue([upsert(event.bookingId)], event.at);
      case "rescheduled":
        return calendarRepo.enqueue([upsert(event.bookingId), ...(event.previousBookingId ? [remove(event.previousBookingId)] : [])], event.at);
      case "cancelled":
      case "payment_failed": // the time is handed back, so it must not stay blocked in their diary
        return calendarRepo.enqueue([remove(event.bookingId)], event.at);
      default:
        return; // completed / no_show: the appointment still happened (or was missed) at that time
    }
  }

  async function run(job: DueJob, now: Date) {
    const b = await calendarRepo.booking(job.bookingId);
    if (!b) return;
    const conn = await calendarRepo.connection(b.staffId);
    if (!conn) return;
    const eventId = await calendarRepo.eventId(b.id);
    const gone = job.action === "delete" || b.status === "cancelled" || b.slotReleased;
    if (gone) {
      if (!eventId) return;
      await provider.deleteEvent(await accessToken(conn, now), conn.calendarId, eventId);
      await calendarRepo.removeEventId(b.id);
      return;
    }
    if (!conn.pushBookings) return;
    const id = await provider.upsertEvent(await accessToken(conn, now), conn.calendarId, eventId, b);
    await calendarRepo.saveEventId(b.id, id);
  }

  /** Writes queued bookings to calendars. Returns how many were handled (done or dropped). */
  async function processDue(now = new Date(), limit = 20): Promise<number> {
    if (!provider.configured()) return 0;
    const jobs = await calendarRepo.claimDue(now, limit, JOB_LEASE_MIN);
    for (const job of jobs) {
      try {
        await run(job, now);
        await calendarRepo.finish(job);
      } catch (err) {
        const b = await calendarRepo.booking(job.bookingId).catch(() => null);
        if (err instanceof ProviderAuthError) {
          if (b) await calendarRepo.markFailed(b.staffId, reason(err), true);
          await calendarRepo.finish(job);
        } else if (job.attempts >= MAX_JOB_ATTEMPTS) {
          if (b) await calendarRepo.markFailed(b.staffId, reason(err), false);
          await calendarRepo.finish(job);
        } else {
          await calendarRepo.retryAt(job, new Date(now.getTime() + backoffMin(job.attempts) * 60_000), reason(err));
        }
      }
    }
    return jobs.length;
  }

  async function refreshBusy(conn: { staffId: string; calendarId: string }, now: Date) {
    const full = await calendarRepo.connection(conn.staffId);
    if (!full) return;
    try {
      const token = await accessToken(full, now);
      const to = new Date(now.getTime() + BUSY_WINDOW_DAYS * 86_400_000);
      // All-day events have no time of day, so they block the person's own midnight-to-midnight.
      const busy = await provider.listBusy(token, full.calendarId, now, to, await calendarRepo.timezone(conn.staffId));
      await calendarRepo.replaceBusy(conn.staffId, busy, now);
    } catch (err) {
      await calendarRepo.markFailed(conn.staffId, reason(err), err instanceof ProviderAuthError);
      throw err;
    }
  }

  /** Re-reads busy times for everyone whose copy is older than the refresh interval. */
  async function syncBusy(now = new Date()): Promise<number> {
    if (!provider.configured()) return 0;
    const due = await calendarRepo.dueForBusySync(new Date(now.getTime() - BUSY_REFRESH_MIN * 60_000), MAX_SYNC_ERRORS);
    let done = 0;
    for (const conn of due) {
      try {
        await refreshBusy(conn, now);
        done++;
      } catch {
        // Recorded on the connection; the others still get their turn.
      }
    }
    return done;
  }

  /** The "Sync now" button: refreshes busy times and pushes anything still queued for this person. */
  async function syncNow(staffId: string, now = new Date()) {
    requireConfigured();
    const conn = await connectionOf(staffId);
    if (conn.blockBusy) {
      try {
        await refreshBusy(conn, now);
      } catch (err) {
        throw new DomainError("invalid", `Google Calendar could not be read: ${reason(err)}`);
      }
    }
    if (conn.pushBookings) await backfill(staffId, now);
    await processDue(now);
  }

  return { status, connectUrl, stateOwner, completeConnect, disconnect, setOptions, onBookingEvent, processDue, syncBusy, syncNow };
}

export type CalendarService = ReturnType<typeof createCalendarService>;
