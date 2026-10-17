# Website booking API (v1)

For the firm's website server. Send the API key as `Authorization: Bearer bk_...` (create one with
`npm run api-key:create -- "Website"`). All times are ISO 8601 in UTC; the firm's time zone comes back with
availability so the website can show local times.

## The website is a thin client

**Every rule lives in this app.** The website shows screens, asks this API what to show, and sends back what the client
chose. It never works out prices, credit, availability, expiry or refunds. The only logic of its own is **one function that
takes a payment through Razorpay** (see below); Razorpay is not connected to this app, so no Razorpay approval is needed here.

| Website screen | Call |
|---|---|
| Service list (with prices) | `GET /api/v1/services` |
| Therapists for a service, **with each one's price** | `GET /api/v1/staff?service=<id>` (`pricePaise` per person) |
| Pick a time | `GET /api/v1/availability`, optionally `POST /api/v1/slot-holds` |
| "This will use 1.5 credits / ₹500 to pay" | `GET /api/v1/credits/quote?phone=&serviceId=&staffId=` |
| Confirm the booking | `POST /api/v1/bookings` (credit is applied for you) |
| Pay the remainder | charge `payment.amountPaise` in Razorpay, then `POST /api/v1/bookings/{id}/payment` |
| "My bookings" (upcoming, past, cancelled) | `GET /api/v1/bookings?phone=&view=upcoming\|past\|cancelled\|all` |
| Finish a payment that is pending or failed | `GET /api/v1/bookings?phone=` then `POST /api/v1/bookings/{id}/resume` |
| Move or cancel a booking | `POST /api/v1/bookings/{id}/reschedule` / `.../cancel` with `X-Manage-Token` (every listed booking carries its `manageToken`) |
| Packages for sale | `GET /api/v1/packages` |
| Buy a package | charge `pricePaise` in Razorpay, then `POST /api/v1/packages/{id}/purchase` |
| Add wallet money | charge the amount in Razorpay, then `POST /api/v1/wallet/top-ups` |
| "My credits" | `GET /api/v1/credits?phone=` |

Who the logged-in client is, is the website's business: it passes their phone number. This app finds (or, on a first
booking or purchase, creates) the client from it.

### The one Razorpay function

Wherever the table says "charge ... in Razorpay", the website calls its single payment function:
`takePayment(amountPaise) -> { razorpayPaymentId, razorpayOrderId, method, paidAt } | failure`.
Everything after it is a call to this API with those details. Because Razorpay stays on the website's side, mapping it later
(test keys first, live keys after Razorpay approves your business) changes nothing here. Every payment report is safe to
repeat: the same Razorpay payment id is recorded once.

## Booking steps in detail

| Step | Call | Notes |
|------|------|-------|
| 1 | `GET /api/v1/services` | Bookable services |
| 2 | `GET /api/v1/staff?service=<id>` | Optional: who offers it |
| 3 | `GET /api/v1/availability?serviceId=&staffId=&from=&to=` | Free start times; leave out `staffId` for anyone. At most 62 days |
| 4 | `POST /api/v1/slot-holds` `{ serviceId, staffId?, start }` | Optional: holds the time for 5 minutes, returns `token` |
| 5 | `POST /api/v1/bookings` with header `Idempotency-Key` | `{ serviceId, staffId?, start, holdToken?, client: { name, phone, email?, whatsappOptIn? }, notes? }` |
| – | `POST /api/v1/bookings/{id}/payment`, `POST /api/v1/bookings/{id}/resume`, `GET /api/v1/bookings?phone=` | Payments: see [online-payments.md](online-payments.md) |
| – | `GET /api/v1/bookings/{id}` | Header `X-Manage-Token` |
| – | `POST /api/v1/bookings/{id}/reschedule` `{ start, holdToken? }` | Header `X-Manage-Token`; returns the new booking |
| – | `POST /api/v1/bookings/{id}/cancel` `{ reason? }` | Header `X-Manage-Token` |
| – | `DELETE /api/v1/slot-holds/{token}` | Let a hold go early |

## Things the website must handle

- **201** on a new booking, with `manageToken`. It is shown only once: keep it with the client's booking
  (for example in the confirmation link) so they can move or cancel it later.
- **200 + `Idempotent-Replayed: true`** when a retry with the same `Idempotency-Key` hits a booking that
  already exists. Use a fresh random key per booking attempt, and the same key when retrying it.
- **409** when the time was just taken or is held by someone else (`details.reason`: `slot_taken`,
  `slot_held`, `slot_unavailable`, `hold_expired`). Show fresh times and let the client pick again.
- **403** when the client tries to move or cancel inside the cut-off set in Settings (24 hours by default).
- **429** when a key sends more than 600 requests a minute (`Retry-After` says how long to wait).
- Services list their `location` and `questions` (`id`, `label`, `type`: `text`, `longtext` or `choice`, `required`, `options`).
  Send the answers in `formAnswers` on the booking, keyed by question `id`. A missing required answer is a 400.
- Phone numbers without a country code are treated as Indian (`98765 43210` → `+919876543210`).

Prepaid packages and wallet money are described in [packages-wallet.md](packages-wallet.md); `GET /api/v1/credits?phone=` and `useCredits` on booking creation are part of the website API.
