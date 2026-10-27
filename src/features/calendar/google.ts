import { zonedToUtc } from "@/lib/time";
import type { CalendarBookingDTO, ExternalBusy } from "./calendar.dto";
import { ProviderAuthError, type CalendarProvider, type ProviderTokens } from "./provider";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
// Events only: the app can read and write events, but cannot see or change the person's other calendar settings.
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
/** Marks events this app wrote, so they are not read back as the person being busy. */
export const BOOKING_PROPERTY = "wakyBookingId";

type Env = Record<string, string | undefined>;

interface GoogleEvent {
  id: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[]; createRequest?: { status?: { statusCode?: string } } };
}

/** The video link Google made for an event, if it has finished making one. */
const meetLinkOf = (e: GoogleEvent): string | null =>
  e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;

async function failure(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => "");
  const message = `${what} failed with HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`;
  // 401 from the calendar API means the access token is bad; the caller refreshes once, then gives up as an auth error.
  if (res.status === 401 || (res.status === 400 && /invalid_grant/.test(text))) throw new ProviderAuthError(message);
  throw new Error(message);
}

function eventBody(b: CalendarBookingDTO, inviteClient: boolean, staffGuest: { email: string; name: string } | null) {
  const attendees = [
    // In the firm's calendar, the therapist is a guest so the session (and its Meet link) shows in their own calendar.
    ...(staffGuest ? [{ email: staffGuest.email, displayName: staffGuest.name }] : []),
    ...(inviteClient && b.clientEmail ? [{ email: b.clientEmail, displayName: b.clientName }] : []),
  ];
  const lines = [
    `Client: ${b.clientName}`,
    `Phone: ${b.clientPhone}`,
    b.clientEmail ? `Email: ${b.clientEmail}` : null,
    b.notes ? `Notes: ${b.notes}` : null,
    "",
    "Booked through Mindlap.",
  ].filter((l): l is string => l !== null);
  return {
    summary: `${b.serviceName} – ${b.clientName}`,
    description: lines.join("\n"),
    location: b.location ?? undefined,
    start: { dateTime: b.startsAt.toISOString(), timeZone: b.timezone },
    end: { dateTime: b.endsAt.toISOString(), timeZone: b.timezone },
    // With invites on, the client is a guest: Google emails them and (for Gmail) puts it in their calendar.
    attendees: attendees.length ? attendees : undefined,
    guestsCanModify: false,
    transparency: "opaque",
    reminders: { useDefault: true },
    extendedProperties: { private: { [BOOKING_PROPERTY]: b.id } },
  };
}

export function createGoogleProvider(env: Env = process.env): CalendarProvider {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID || env.AUTH_GOOGLE_ID;
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET;

  async function tokenRequest(params: Record<string, string>) {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId ?? "", client_secret: clientSecret ?? "", ...params }),
    });
    if (!res.ok) return failure(res, "Google token request");
    return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
  }

  const authed = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  const eventUrl = (calendarId: string, eventId?: string) =>
    `${API}/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

  return {
    id: "google",
    configured: () => Boolean(clientId && clientSecret),

    authUrl(state, redirectUri) {
      const url = new URL(AUTH);
      url.search = new URLSearchParams({
        client_id: clientId ?? "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        // offline + consent: Google only hands out a refresh token the first time unless asked again.
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      }).toString();
      return url.toString();
    },

    async exchangeCode(code, redirectUri): Promise<ProviderTokens> {
      const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
      if (!t.refresh_token) throw new Error("Google did not return a refresh token; remove the app from your Google account's connections and try again");
      // The id token only came from this exchange with Google, so reading the email from it without re-verifying is fine.
      let accountEmail: string | null = null;
      try {
        const payload = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
        accountEmail = typeof payload.email === "string" ? payload.email : null;
      } catch {
        // The email is only a label.
      }
      return { refreshToken: t.refresh_token, accessToken: t.access_token, accessExpiresAt: Date.now() + t.expires_in * 1000, accountEmail };
    },

    async refresh(refreshToken) {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      return { accessToken: t.access_token, accessExpiresAt: Date.now() + t.expires_in * 1000 };
    },

    async revoke(token) {
      await fetch(REVOKE, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => undefined);
    },

    async listBusy(accessToken, calendarId, from, to, timeZone): Promise<ExternalBusy[]> {
      const out: ExternalBusy[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(eventUrl(calendarId));
        url.search = new URLSearchParams({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: "true", // expands repeating events into the occurrences that actually fall in the window
          maxResults: "250",
          fields: "nextPageToken,items(id,status,transparency,start,end,extendedProperties/private)",
          ...(pageToken ? { pageToken } : {}),
        }).toString();
        const res = await fetch(url, { headers: authed(accessToken) });
        if (!res.ok) return failure(res, "Google events list");
        const page = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
        for (const e of page.items ?? []) {
          // Our own events are already counted as bookings; free-marked and cancelled events don't block anything.
          if (e.status === "cancelled" || e.transparency === "transparent" || e.extendedProperties?.private?.[BOOKING_PROPERTY]) continue;
          const start = e.start?.dateTime ? new Date(e.start.dateTime) : e.start?.date ? zonedToUtc(`${e.start.date}T00:00`, timeZone) : null;
          const end = e.end?.dateTime ? new Date(e.end.dateTime) : e.end?.date ? zonedToUtc(`${e.end.date}T00:00`, timeZone) : null;
          if (start && end && start < end) out.push({ externalId: e.id, start, end });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    async upsertEvent(accessToken, calendarId, eventId, booking, inviteClient, meet, staffGuest = null) {
      const base = eventBody(booking, inviteClient, staffGuest);
      const notify = inviteClient && booking.clientEmail ? "all" : "none";
      // conferenceDataVersion=1 is what lets the request create or remove a Meet link; without it Google ignores that part.
      const version = meet.want || meet.remove ? "&conferenceDataVersion=1" : "";
      // The request id makes asking twice for the same booking's link return the same link, not two.
      const createRequest = { createRequest: { requestId: `booking-${booking.id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
      const read = async (res: Response, what: string) => {
        if (!res.ok) return failure(res, what);
        const ev = (await res.json()) as GoogleEvent;
        return { eventId: ev.id, meetUrl: meetLinkOf(ev) };
      };
      if (eventId) {
        // An event that already has a link keeps it (leaving conferenceData out of the patch preserves it).
        const body = JSON.stringify({ ...base, ...(meet.want && !meet.hasLink ? { conferenceData: createRequest } : {}), ...(meet.remove ? { conferenceData: null } : {}) });
        const res = await fetch(`${eventUrl(calendarId, eventId)}?sendUpdates=${notify}${version}`, { method: "PATCH", headers: authed(accessToken), body });
        if (res.ok) return read(res, "Google event update");
        // The person deleted the event by hand (or connected a different calendar): write a fresh one.
        if (res.status !== 404 && res.status !== 410) return failure(res, "Google event update");
      }
      const body = JSON.stringify({ ...base, ...(meet.want ? { conferenceData: createRequest } : {}) });
      return read(await fetch(`${eventUrl(calendarId)}?sendUpdates=${notify}${version}`, { method: "POST", headers: authed(accessToken), body }), "Google event create");
    },

    async deleteEvent(accessToken, calendarId, eventId, notifyGuests) {
      const res = await fetch(`${eventUrl(calendarId, eventId)}?sendUpdates=${notifyGuests ? "all" : "none"}`, { method: "DELETE", headers: authed(accessToken) });
      if (!res.ok && res.status !== 404 && res.status !== 410) await failure(res, "Google event delete");
    },
  };
}
