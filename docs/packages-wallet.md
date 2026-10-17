# Packages and wallet credit

Every client's prepaid assets are tracked two ways at once:

| | Package credit | Wallet credit |
|---|---|---|
| What it counts | Credits (sessions) the client can still book | The exact rupees the client paid and has not yet used |
| Why | The same therapy costs less per session in a bigger package (₹1,000 single, ₹900 each in a 4-pack, ₹800 each in an 8-pack), so the number of credits and the money they stand for differ | |

Tracking both lets the firm see what each client has paid for, whatever they then book: any service, with any therapist,
cheaper or dearer. The app records what happens; it does not restrict where credit can be spent (apart from the services a
package is set to cover).

## Packages

A package is **credits for a price**, plus **how much service price one credit covers** (₹1,000 by default).

> 4 credits for ₹3,600, one credit covers ₹1,000. The client has 4 credits and ₹3,600 in the wallet total.
> Each credit stands for ₹900 of money (3,600 ÷ 4) and covers ₹1,000 of service price.
> An 8-credit package for ₹6,400 stands for ₹800 a credit.

**A booking uses credits in proportion to its price.** A ₹1,500 service takes **1.5 credits**; a ₹5,000 therapist takes 5.
Credits can be fractions. The wallet total falls by the money those credits stand for: 1.5 credits of the ₹3,600 package takes
**₹1,350** off it, and cancelling puts back exactly the credits and the rupees. A price that doesn't divide evenly is split so
the credits add up to exactly what was paid.

Set up under **Packages** (managers): name, credits, price, what one credit covers, the services it can pay for (none ticked =
any), and days valid (default 365; blank = never expires). Editing a package affects new sales only.

## Wallet money

**Add wallet money** on a client's page records money paid in advance with no package. A booking takes its price in rupees.
It expires a year after it is added and is never paid back in cash.

The wallet total shown for a client is the unused value of their packages plus their wallet money. Only wallet money (top-ups)
can pay for a booking directly; package value is spent only through package credits, so one payment is never counted twice.

## How a booking is paid

For a booking of price P (the therapist's own price if they have one, otherwise the service's price):

1. **Package credits** that cover the service, the package expiring soonest first. Each credit covers its package's credit value.
   One booking can use several packages.
2. **Wallet money**, oldest expiry first, for whatever packages did not cover.
3. **The rest** is paid in the normal way: at the desk, or online through the website. `payment.amountPaise` in the booking
   response is the **remaining** amount to charge.

A booking fully covered is **Paid** at once: no payment clock, and the confirmation goes out immediately. A service with a text
price (e.g. "From ₹500") counts as one credit and charges nothing extra. Free services use no credit.

## Per-therapist prices

*Staff → their name → Services they offer and their price.* A price there is what that person charges for the service. It decides
how many credits (or how much wallet money) a booking with them takes.

## Giving credit back

| What happens | Credit |
|---|---|
| Booking cancelled (by staff, client or website) | Given back: the credits and the exact rupees taken |
| Unpaid online booking cancelled after the 24-hour resume window | Given back |
| 15-minute payment window runs out | Held, so the client can resume within 24 hours |
| Booking moved (any time, any therapist) | Stays with the booking; nothing is taken twice or topped up |
| No-show, **client** missed it | Stays used |
| No-show, **staff** missed it | Given back |
| Package or money expired before it is given back | Not restored (it could not be used anyway); the history shows it as returned |

Undoing a "staff no-show" later does not take the credit again.

**Staff** can press **Pay with their credit** on an unpaid upcoming booking, for example after the client bought a package.

## Website API

- `GET /api/v1/credits?phone=+919876543210` → `{ packages: [{ id, name, creditsLeft, creditsTotal, creditValuePaise, valueLeftPaise, serviceIds, expiresAt }], walletPaise, packageValuePaise, totalPaise, wallet: [...] }`.
- `GET /api/v1/credits/quote?phone=...&serviceId=...&staffId=...` → what a booking would use, taking nothing:
  `{ pricePaise, creditsUsed, walletPaise, duePaise, covered, uses: [...] }`. Show "This uses 1.5 credits" or "₹500 left to pay"
  before the client commits. Leave out `staffId` to price the service at its own price.
- `POST /api/v1/bookings` uses credit automatically exactly as the quote said. Send `"useCredits": false` to leave the balance alone.
  The response's `payment.credit` is `{ credits, walletPaise }` and `payment.amountPaise` is what is left to charge.
  Always charge the response's amount, not the quote's: the balance may have changed in between.

## Safety

Credit is taken inside the same database transaction as the booking, with the rows locked: two bookings made at the same moment
cannot spend the same credit or rupee, and a balance cannot go below zero. Every use is kept (with a "given back" mark) and is
shown on the booking page and the client page.

## Not built yet

Website endpoints to buy a package or add wallet money (reporting the Razorpay payment); reports on credit sold, used and
expired; refunds to cash; restricting a package to certain therapists; detecting no-shows automatically from Google Meet.
