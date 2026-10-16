# Booking page and client pages

Clients don't need a website or an API key.

- **`/book`**: pick a service, a person (or "anyone available"), a day and a time, then enter details. Shows the
  firm's logo, colour and welcome message from Settings > Booking page. Add `?embed=1` to drop the header, for an
  iframe on your own site (the exact snippet is in Settings). Link straight to one service with `?service=<id>`.
- **`/manage/<booking id>?t=<token>`**: where the client lands after booking, and the link in confirmation and
  reminder messages (`{{manage_link}}`). They can add it to their calendar (.ics), reschedule, or cancel, within the
  cut-off set in Settings. The token is signed with `AUTH_SECRET`, works for that one booking only, and a wrong link
  looks exactly like a missing booking.
- Public actions are rate limited per visitor (8 bookings per 10 minutes, 20 changes per 10 minutes). The limit is
  kept in the app's memory, so with several containers each one counts separately.

## Rules staff can set

- **Settings > Holidays**: whole-firm closed days. Nobody can be booked, even if they added extra hours that day.
- **Services**: where it happens (address or meeting link), questions for the client (one per line: `Reason*`,
  `Notes (long)`, `Language: English, Hindi`), and most bookings per day.
- **Reports** (managers and admins): counts by status, payment, who missed a no-show, per service and per person,
  plus CSV downloads of bookings and clients.

## Not built (needs outside accounts)

Google, Outlook and Zoho Calendar sync, Zoom or Meet links, online card payments, SMS, group or resource bookings,
recurring bookings.
