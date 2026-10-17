# Online sessions with Google Meet

A booking for an online service gets a **Google Meet link** made in the therapist's Google Calendar event. The app keeps the
link on the booking and passes it on. It uses the Google Calendar connection (`docs/google-calendar.md`) and needs no extra
permission from the therapist.

## Switches (all must agree)

| Level | Where | Default |
|---|---|---|
| Firm | Settings → Online sessions → "Use Google Meet for online sessions" | Off |
| Service | Services → each service → **How it happens**: In person or Online with Google Meet | In person |
| Therapist | Staff → their name → Google Calendar → "Create Google Meet links for my online sessions" (calendar must be connected) | On once connected |
| One booking | Booking page → Online session: **Make it online**, **Remove link**, or paste any link (Zoom …) | Follows the service |

If any level is off, the booking is made normally with no link. A booking never fails because a link could not be made.

## How the link travels

1. A booking is confirmed. The calendar sync (every 30 s) writes the Google event and asks Google for a Meet link. If Google needs a
   moment, it retries.
2. Clients are never sent the raw Meet address. Messages carry the app's own **join link**, `{{meeting_link}}`
   (`/join/<booking>?t=<token>`), which is valid from the moment of booking and redirects to the Meet. Before the Meet exists it says
   "your link is being prepared" and checks again by itself. It says "cancelled" for a cancelled booking.
3. **Moving a booking** to another time with the same therapist moves the Google event, so the Meet link stays the same. Moving to a
   different therapist removes the old event and makes a new one with its own link.
4. **Cancelling** removes the event; the join link stops working.

## Where it shows

- **Booking page** (staff): Join button, the link, and the controls above.
- **Today screen:** a Join button on each of the therapist's online sessions (also "Coming up").
- **Client's manage page:** "Join your online session".
- **Emails and WhatsApp:** the `{{meeting_link}}` variable (empty for in-person).
- **Calendar invite attached to the email:** the join link as the event URL and in its notes, so Google, Outlook and Apple show a Join button.
- **Therapist's Google Calendar event:** Google's own Meet button.

The website API carries no meeting field (the website does not need one yet).

## Good to know

- Clients who join without a Google account usually "ask to join" and the therapist lets them in.
- A link staff pasted (Zoom etc.) is kept and never replaced by a Google one, unless staff press "Use Google Meet instead".
- Removing a link takes it off the booking within about half a minute, when the sync removes it from the Google event.
- Detecting no-shows from who joined the Meet is **not built**. It would need one more Google permission from each therapist.
