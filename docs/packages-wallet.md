# Packages and wallet credit

Two kinds of prepaid credit, tracked separately for each client.

| | Package credit | Wallet credit |
|---|---|---|
| Counts | Sessions | Rupees |
| Example | 4 sessions for ₹3,600 | ₹10,000 paid in advance |
| A booking takes | 1 session | The session's price |
| Expires | After the package's "valid for" days (default 365; blank = never) | 365 days after each top-up |

Money is never paid back in cash, from either.

## Setting up

- **Packages** (left menu, managers): name, the services it can pay for (none ticked = any), sessions, price, validity.
  The page shows the value of one session (₹3,600 ÷ 4 = ₹900), which is also what reports will count as income per session.
  Editing a package only affects new sales.
- **Per-therapist prices:** *Staff → their name → Services they offer and their price.* A price there is what that person
  charges for the service, and it wins over the service's own price. Blank = the service's price. The wallet takes the price
  of whoever is booked.
- **Selling:** on a client's page, **Sell a package** or **Add wallet money**, with a note of how it was paid. Payment is taken
  outside the app (cash, UPI, your website).

## How a booking pays

1. A package session, if the client has one that covers the service (the one expiring soonest). Free services never use one.
2. Otherwise wallet money, oldest expiry first, up to the price.
3. If the wallet is short, it pays what it holds and the rest is paid normally: at the desk, or online through your website
   (`payment.amountPaise` in the booking response is the **remaining** amount to charge in Razorpay).

A booking fully covered by credit is **Paid** at once: no payment clock, and the confirmation goes out immediately.

## Giving credit back

| What happens | Credit |
|---|---|
| Booking cancelled (by staff, client or website) | Given back: the session, or the exact rupees taken |
| Unpaid online booking cancelled after the 24-hour resume window | Given back |
| 15-minute payment window runs out | Held, so the client can resume within 24 hours |
| Booking moved to another time | Stays with the booking; nothing taken twice |
| No-show, **client** missed it | Stays used |
| No-show, **staff** missed it | Given back |
| Package or wallet money expired before it is given back | Not restored (it could not be used anyway); the history shows it as returned |

Undoing a "staff no-show" later (setting the booking back to completed) does not take the credit again.

## Website API

- `GET /api/v1/credits?phone=+919876543210` returns `{ packages: [{ id, name, sessionsLeft, sessionsTotal, serviceIds, expiresAt }], walletPaise, wallet: [...] }`.
  Use it to show "You have 3 sessions left" before booking.
- `POST /api/v1/bookings` uses credit automatically. Send `"useCredits": false` to leave the client's balance alone.
- The booking's `payment.credit` is `{ session, walletPaise }`: what was paid from credit. `payment.amountPaise` is what is left to pay.

## Safety

Credit is taken inside the same database transaction as the booking, with the rows locked: two bookings made at the same
moment cannot spend the same session or rupee, and a balance cannot go below zero. Every use is kept (with a "given back" mark)
on the booking page and the client page, so any balance can be explained.

## Not built yet

Reports on credit sold, used and expired; refunds to cash; sharing a package between family members; detecting no-shows
automatically from Google Meet.
