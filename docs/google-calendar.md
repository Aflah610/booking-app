# Google Calendar

Each staff member can connect their own Google Calendar from their **Availability** page (Staff → their name).

- **Bookings go in:** a new booking becomes an event in their calendar. Moving a booking moves the event; cancelling
  removes it. Bookings waiting for online payment are added only once paid.
- **Busy times come out:** events already in their calendar block those hours, so clients cannot book over a
  dentist visit or a personal appointment. Events marked "free", cancelled events, and the events this app wrote
  itself are ignored.
- Each direction has its own switch on the same page, and **Sync now** refreshes immediately.

No client is emailed an invite by Google. The event is a diary entry for the staff member; clients still get the
firm's own confirmations (see workflows).

## One-time setup (the firm, not each person)

1. In [Google Cloud Console](https://console.cloud.google.com), create or pick a project and enable the **Google Calendar API**.
2. *APIs & Services → OAuth consent screen:* add the scopes `openid`, `email` and `.../auth/calendar.events`.
   While the app is in "Testing", add each staff member's Google address as a test user. For the whole firm, publish the app
   (the calendar events scope is "sensitive": Google asks for a short verification unless the users are in your own Workspace
   and the app is set to Internal).
3. *Credentials → Create OAuth client ID → Web application.* Add the redirect URI
   `https://<your-app-domain>/api/calendar/google/callback` (for local use `http://localhost:3000/api/calendar/google/callback`).
4. Put these in the environment (see `.env.example`) and restart:

   | Variable | |
   |---|---|
   | `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` | The OAuth client. If blank, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are used (add the redirect URI to that client). |
   | `AUTH_URL` | The app's public address; must match the redirect URI. |
   | `CALENDAR_ENCRYPTION_KEY` | Optional but recommended: `openssl rand -hex 32`. Encrypts the stored tokens. Without it `AUTH_SECRET` is used, and changing `AUTH_SECRET` disconnects everyone. |

Until the credentials are set, the Availability page says Google Calendar is not set up and nothing else changes.

## How it works

Code is in `src/features/calendar/`.

- `calendar_connection` holds one row per person; their tokens are AES-256-GCM encrypted. `calendar_job` is a queue of
  pending writes (one row per booking). `calendar_busy` is a copy of their busy times; `booking_calendar_event` remembers
  which Google event belongs to which booking.
- The worker (every 30 s, inside the app) writes queued bookings and re-reads busy times for connections older than 5 minutes,
  looking 90 days ahead. Slot requests read the copy, so they never wait on Google.
- Google being down never affects a booking: the write is retried after 2, 4, 8 … up to 60 minutes (8 tries), then dropped
  and shown on the staff page. If Google says access was revoked, syncing stops until the person disconnects and reconnects.
- A client booking made in the last few minutes can still clash with a brand-new Google event that has not been copied yet.
  Anything created in Google is picked up within 5 minutes.
- Other calendars (Outlook, Zoho) would be a new file implementing `CalendarProvider` in `provider.ts`; the sync rules stay as they are.

## Not included yet

Google push notifications (instant instead of every 5 minutes), choosing a calendar other than the main one,
and inviting the client as an attendee. The columns for push channels already exist in `calendar_connection`.
