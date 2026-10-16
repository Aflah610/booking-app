# Google Calendar

Each staff member can connect their own Google Calendar from their **Availability** page (Staff → their name).

- **Bookings go in:** a new booking becomes an event in their calendar. Moving a booking moves the event; cancelling
  removes it. Bookings waiting for online payment are added only once paid.
- **Busy times come out:** events already in their calendar block those hours, so clients cannot book over a
  dentist visit or a personal appointment. Events marked "free", cancelled events, and the events this app wrote
  itself are ignored.
- Each direction has its own switch on the same page, and **Sync now** refreshes immediately.

## Adding the appointment to the client's calendar (any email address)

This works without Google being connected at all. In **Workflows**, open an email workflow that goes to the client
(the starter templates for booking, reschedule, cancellation and payment received have it on) and tick
**Attach a calendar invite**. The email then carries a standard calendar invitation:

- **Gmail / Google Workspace clients:** the appointment is added to their Google Calendar automatically and shows
  in the email (their Google setting "Automatically add invitations" decides; the default adds them).
- **Outlook, Apple Mail and others:** the email shows an **Add to calendar** (or Accept) button.
- Moving a booking updates the same calendar entry; cancelling removes it. This holds for repeated moves.
- The invitation is sent from your firm's email address (`EMAIL_FROM`), so email must be set up (`SMTP_*`).

Message templates also have three link variables for people who prefer a link: `{{add_to_google}}`,
`{{add_to_outlook}}` and `{{add_to_calendar}}` (a file for Apple Calendar and the Outlook app).

Use either this **or** the Google invite below, not both: a client would get two entries for one appointment.

## Inviting the client from the staff member's Google Calendar

Turn on **Email clients a calendar invite** and the client becomes a guest on the event. Google emails them the
invitation from the staff member's Google account. Gmail users usually see it in their calendar straight away; Outlook
and Apple Calendar users get an "Add to calendar" button in the email. Cancelling a booking sends them a cancellation.
Moving a booking sends a cancellation for the old time and a new invitation (Google treats it as a new event).

- Needs the client's email on the booking. Bookings without one are written to the staff diary only.
- It is off by default, because it sends real email to clients. It applies to new bookings only: turning it on or
  pressing Sync now does not re-send anything for bookings already in the calendar.
- It is in addition to the firm's own confirmation workflow, so a client with both gets two emails. Switch off the
  "Booked" email workflow for clients if you only want the invite.
- Google limits how many invitations an account can send per day (a few hundred for ordinary accounts).
- Without this switch no client is emailed by Google; the event is just a diary entry. Clients can still use
  "Add to calendar" on their manage page.

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
