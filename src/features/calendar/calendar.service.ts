import { DomainError } from "@/features/shared/errors";
import type { BookingEvent } from "@/features/bookings/bookings.dto";
import type { CalendarBookingDTO } from "./calendar.dto";
import { isOnlineSession } from "@/features/bookings/meeting";
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
 * Staff who haven't connected their own calendar can be covered by the firm's calendar (Settings > Online sessions):
 * it holds their events and makes the Meet links, with the therapist added as a guest.
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
    // The firm calendar was this one: nobody covers unconnected staff until someone else is chosen.
    if ((await calendarRepo.meetStaffId()) === staffId) await calendarRepo.setMeetStaffId(null);
  }

  /** The firm calendar that covers staff without their own; null switches it off. Catches up their upcoming bookings. */
  async function setMeetCalendar(staffId: string | null, now = new Date()) {
    if (staffId && !(await calendarRepo.connectedStaff()).some((s) => s.staffId === staffId)) {
      throw new DomainError("invalid", "Choose someone whose Google Calendar is connected");
    }
    await calendarRepo.setMeetStaffId(staffId);
    if (staffId) await calendarRepo.enqueue((await calendarRepo.unconnectedUpcomingBookingIds(now)).map((bookingId) => ({ bookingId, action: "upsert" as const })), now);
  }

  /** A new event goes in the therapist's own calendar, or the firm's when they have none. */
  async function calendarFor(b: CalendarBookingDTO) {
    return (await calendarRepo.connection(b.staffId)) ?? (b.meetStaffId ? calendarRepo.connection(b.meetStaffId) : null);
  }

  async function setOptions(staffId: string, options: { pushBookings: boolean; blockBusy: boolean; inviteClients: boolean; createMeetLinks: boolean }, now = new Date()) {
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
      case "rescheduled": {
        const prev = event.previousBookingId;
        // Same therapist: the event (and its Meet link) moves with the booking. Another therapist: remove the old event, make a new one.
        if (prev && (await calendarRepo.moveEvent(prev, event.bookingId))) {
          await calendarRepo.dropJobs([prev]);
          return calendarRepo.enqueue([upsert(event.bookingId)], event.at);
        }
        return calendarRepo.enqueue([upsert(event.bookingId), ...(prev ? [remove(prev)] : [])], event.at);
      }
      case "meeting_changed":
        return calendarRepo.enqueue([upsert(event.bookingId)], event.at);
      case "cancelled":
      case "payment_failed": // the time is handed back, so it must not stay blocked in their diary
        return calendarRepo.enqueue([remove(event.bookingId)], event.at);
      default:
        return; // completed / no_show: the appointment still happened (or was missed) at that time
    }
  }

  /** `used` reports whose calendar the job worked on, so a failure is recorded against that connection. */
  async function run(job: DueJob, now: Date, used: { staffId: string | null }) {
    const b = await calendarRepo.booking(job.bookingId);
    if (!b) return;
    const event = await calendarRepo.event(b.id);
    // An existing event stays in the calendar that made it, so the client's Meet link never changes under them.
    const conn = event ? await calendarRepo.connection(event.calendarStaffId ?? b.staffId) : await calendarFor(b);
    if (!conn) return;
    used.staffId = conn.staffId;
    const eventId = event?.eventId ?? null;
    const gone = job.action === "delete" || b.status === "cancelled" || b.slotReleased;
    if (gone) {
      if (!eventId) return;
      await provider.deleteEvent(await accessToken(conn, now), conn.calendarId, eventId, conn.inviteClients);
      await calendarRepo.removeEventId(b.id);
      return;
    }
    if (!conn.pushBookings) return;
    // An online session gets a Google Meet link when the firm, the service (or this booking) and the therapist all want one.
    // A link staff pasted by hand is left alone.
    const online = isOnlineSession(b, b.meetEnabled);
    const want = online && conn.createMeetLinks && b.meetingSource !== "manual";
    const hasLink = b.meetingSource === "google" && Boolean(b.meetingUrl);
    const staffGuest = conn.staffId === b.staffId ? null : { email: b.staffEmail, name: b.staffName };
    const result = await provider.upsertEvent(await accessToken(conn, now), conn.calendarId, eventId, b, conn.inviteClients, {
      want,
      hasLink,
      // Switched off for this booking (or the service no longer wants one): take the link off the event.
      remove: !want && hasLink,
    }, staffGuest);
    await calendarRepo.saveEventId(b.id, result.eventId, conn.staffId);
    if (want && result.meetUrl) await calendarRepo.saveGoogleMeeting(b.id, result.meetUrl);
    else if (!want && hasLink) await calendarRepo.clearGoogleMeeting(b.id);
    // Google sometimes needs a moment to make the link: the event is saved, so the retry only asks for the link.
    else if (want && !result.meetUrl) throw new Error("Google has not made the Meet link yet");
  }

  /** Writes queued bookings to calendars. Returns how many were handled (done or dropped). */
  async function processDue(now = new Date(), limit = 20): Promise<number> {
    if (!provider.configured()) return 0;
    const jobs = await calendarRepo.claimDue(now, limit, JOB_LEASE_MIN);
    for (const job of jobs) {
      const used = { staffId: null as string | null };
      try {
        await run(job, now, used);
        await calendarRepo.finish(job);
      } catch (err) {
        if (err instanceof ProviderAuthError) {
          if (used.staffId) await calendarRepo.markFailed(used.staffId, reason(err), true);
          await calendarRepo.finish(job);
        } else if (job.attempts >= MAX_JOB_ATTEMPTS) {
          if (used.staffId) await calendarRepo.markFailed(used.staffId, reason(err), false);
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

  return {
    status, connectUrl, stateOwner, completeConnect, disconnect, setOptions, setMeetCalendar, onBookingEvent, processDue, syncBusy, syncNow,
    meetCalendar: async () => ({ staffId: await calendarRepo.meetStaffId(), choices: await calendarRepo.connectedStaff() }),
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;
