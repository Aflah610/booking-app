# Waky Booking API reference (v1)

For the developer connecting a website to Waky Booking: list services and therapists, fetch free dates and times,
book, take payment through Razorpay, and let clients view, move or cancel their bookings.

**Base URL:** `https://waky-booking-50046919821.development.catalystappsail.in/api/v1`
(the address changes if the app moves to Catalyst Production or a custom domain; keep it in one setting.)

---

## 1. Basics

### Authentication

Every call needs an API key, sent from **your website's server**:

```http
Authorization: Bearer bk_xxxxxxxxxxxxxxxx
```

(`X-API-Key: bk_…` also works.) An admin creates the key in **Settings > API** or with
`npm run api-key:create -- "Website"`. It is shown once.

- **Never put the key in browser JavaScript, an app, or a public repository.** Anyone with it can book in your name.
  Call this API from your server (a backend route, a Cloudflare Worker, a serverless function) and pass the results on.
- Key scopes: `website` (everything in this document except OTP) and `otp` (the two OTP calls). A `staff` key can call
  everything.

### Requests and responses

- JSON in (`Content-Type: application/json`), JSON out.
- Success: `{ "data": … }` with status 200 or 201.
- Failure: `{ "error": { "code": "…", "message": "…", "details": … } }`. `message` is safe to show a person;
  `details` (when present) says exactly what was wrong.
- **Times** are ISO 8601 in UTC, e.g. `"2026-10-30T04:30:00.000Z"` (10:00 am in India). Availability answers include
  the firm's `timezone` (`"Asia/Kolkata"`) so you can show local times.
- **Money** is in **paise** (₹1 = 100 paise): `150000` is ₹1,500. Razorpay uses the same unit.
- **Phone numbers**: send international format `+919876543210`. A 10-digit number without a code is taken as Indian.
  Clients are matched by phone: the same number is always the same client.

### Errors

| Status | `error.code` | Meaning | What to do |
|---|---|---|---|
| 400 | `invalid` | A field is missing or wrong | Show `message`; `details` lists the fields |
| 401 | `unauthorized` | No key, or a wrong one | Check the key on your server |
| 403 | `forbidden` | Not allowed (e.g. too close to the start to cancel online, or a wrong manage token) | Show `message` |
| 404 | `not_found` | No such service, booking, package… | |
| 409 | `conflict` | The time was just taken, a payment clashes… | See `details.reason` below |
| 429 | `rate_limited` | More than 600 requests a minute for this key | Wait `Retry-After` seconds |
| 500 | `internal` | Our fault | Retry later; tell us |

`details.reason` values you may meet:

| Reason | When | What to do |
|---|---|---|
| `slot_taken` | Someone booked that time first | Fetch availability again, let the client pick |
| `slot_held` | Another client is holding it (up to 5 minutes) | Same as above |
| `slot_unavailable` | The time is no longer free (resume or reschedule) | Same as above |
| `hold_expired`, `hold_missing` | The hold token ran out or is unknown | Book without a hold, or hold again |
| `time_passed` | The start time is in the past | Pick a future time |
| `idempotency_key_reused` | Same `Idempotency-Key` sent with a different request | Use a new key for a new booking |
| `amount_mismatch` | The amount reported doesn't match the price | Charge `details.expectedPaise` |
| `already_paid`, `payment_reused` | The booking is paid, or that Razorpay payment belongs to another booking | Don't charge again |
| `booking_cancelled` | Money was taken after the booking was cancelled | It is recorded and flagged for a refund in Razorpay |
| `package_not_on_sale` | The package was withdrawn | Refresh the package list |
| `answer_required`, `answer_invalid` | A service question was not answered properly | Show `message` |
| `not_upcoming`, `already_cancelled` | The booking can no longer be changed | Refresh the booking |

### Idempotency (safe retries)

`POST /bookings` **requires** an `Idempotency-Key` header: a random string (8–200 characters), new for each booking
attempt and **the same when you retry that attempt** (e.g. after a timeout). A retry returns the original booking
with status 200 and the header `Idempotent-Replayed: true`, so a client is never booked twice.
Payment reports are safe to repeat too: the same `razorpayPaymentId` is counted once.

---

## 2. The flows

### A. Book a session (no online payment)

1. `GET /services`: show the services.
2. `GET /staff?service=<serviceId>`: show the therapists (and each one's price). Optional: "anyone available".
3. `GET /availability?serviceId=…&staffId=…&from=…&to=…`: show free dates and times.
4. Optional: `POST /slot-holds` when the client picks a time, to keep it for 5 minutes while they fill in the form.
5. `POST /bookings` with `Idempotency-Key`. Store the returned `booking.id` and `manageToken` with the client.

### B. Book and pay online with Razorpay

Online payment is switched on in **Settings > Online payment**. Then a website booking of a service with a price is
held unpaid for **15 minutes** (`payment.dueAt`), and resumable for **24 hours** (`payment.resumeUntil`).

1. Steps 1–3 of flow A.
2. Optional: `GET /credits/quote?phone=…&serviceId=…&staffId=…` to show "uses 1 credit, ₹500 left to pay".
3. `POST /bookings`. Package credit and wallet money are applied automatically; `payment.amountPaise` is what is left.
   If `payment.action` is `"pay"`, charge that amount.
4. Create a Razorpay order for `payment.amountPaise` on your server and open Razorpay Checkout.
5. When Checkout finishes, **verify Razorpay's signature on your server**, then report it:
   `POST /bookings/{id}/payment` with `status: "paid"` (or `"failed"`). A paid report confirms the booking.
6. No payment within 15 minutes: the booking becomes `failed` and the time is offered to others. The client can come
   back within 24 hours: `POST /bookings/{id}/resume`, then steps 4–5 again.

### C. Buy a package and book in one go

Charge the package price in Razorpay, then send `POST /bookings` with a `purchase` object (see 3.6). The package is
recorded first and then pays for this booking. Or sell a package on its own: `POST /packages/{id}/purchase`.

### D. "My bookings", move and cancel

1. `GET /bookings?phone=+91…&view=upcoming|past|cancelled|pending|all` (each item carries its `manageToken`).
2. Move: `POST /bookings/{id}/reschedule` with header `X-Manage-Token`.
3. Cancel: `POST /bookings/{id}/cancel` with header `X-Manage-Token`.

Moving and cancelling online close a set number of hours before the start (24 by default, in Settings). Inside that
window you get 403 and should ask the client to call.

---

## 3. Endpoints

### 3.1 `GET /services`

Bookable services.

```json
{ "data": [ {
  "id": "ec04ab46-9f5f-4d7c-b899-8e13d875c229",
  "name": "Individual therapy",
  "description": null,
  "durationMin": 60,
  "priceDisplay": "₹1,000",
  "pricePaise": 100000,
  "location": null,
  "questions": [ { "id": "reason", "label": "Reason for visit", "type": "text", "required": true, "options": [] } ]
} ] }
```

- `pricePaise` is null when the price isn't a plain amount (e.g. "From ₹500").
- `questions`: extra fields to ask; `type` is `text`, `longtext` or `choice` (with `options`). Send answers in
  `formAnswers` when booking, keyed by question `id`.

### 3.2 `GET /staff?service=<serviceId>`

Therapists who offer the service. Names only, never emails.

```json
{ "data": [ { "id": "23926164-1d05-45eb-a4d7-554b7db77ec9", "name": "Rishin P K", "timezone": "Asia/Kolkata", "pricePaise": 100000 } ] }
```

`pricePaise` is this person's price for the service (their own, else the service's).

### 3.3 `GET /availability`

| Query | Required | |
|---|---|---|
| `serviceId` | yes | |
| `staffId` | no | Leave out for "anyone available" |
| `from`, `to` | yes | ISO 8601; `to` after `from`; at most **62 days** apart |

```http
GET /availability?serviceId=ec04…&staffId=2392…&from=2026-10-27T00:00:00%2B05:30&to=2026-11-03T00:00:00%2B05:30
```

```json
{ "data": {
  "serviceId": "ec04ab46-…", "durationMin": 60, "timezone": "Asia/Kolkata",
  "slots": [
    { "start": "2026-10-27T03:30:00.000Z", "end": "2026-10-27T04:30:00.000Z", "staffIds": ["23926164-…"] },
    { "start": "2026-10-27T03:45:00.000Z", "end": "2026-10-27T04:45:00.000Z", "staffIds": ["23926164-…"] }
  ]
} }
```

- **Dates with free times** = the days that appear in `slots` (group by the local date in `timezone`).
- Slots already account for working hours, time off, holidays, existing bookings, minimum notice and how far ahead
  booking is allowed. `staffIds` lists who is free then.
- It is a snapshot: the booking call checks again, so a 409 is still possible.

### 3.4 `POST /slot-holds` and `DELETE /slot-holds/{token}`

Optional. Holds a time for 5 minutes so nobody else can take it while the client fills in the form.

```json
{ "serviceId": "ec04…", "staffId": "2392…", "start": "2026-10-27T03:30:00.000Z" }
```

201:

```json
{ "data": { "token": "Xq3v…(random)", "staffId": "2392…", "start": "2026-10-27T03:30:00.000Z", "end": "2026-10-27T04:30:00.000Z", "expiresAt": "2026-10-27T03:05:00.000Z" } }
```

Send `token` as `holdToken` when booking. Tokens are random strings; treat them as opaque. `DELETE /slot-holds/{token}` lets it go early; answers `{ "released": true }`.

### 3.5 `POST /bookings`

Headers: `Authorization`, `Content-Type: application/json`, **`Idempotency-Key: <random>`**.

| Field | Required | |
|---|---|---|
| `serviceId` | yes | |
| `staffId` | no | Leave out to give it to whoever is free (work is spread evenly) |
| `start` | yes | A `start` from availability (whole minute, UTC) |
| `client.name` | yes | |
| `client.phone` | yes | `+919876543210` |
| `client.email` | no | Needed for email confirmations and calendar invites |
| `client.whatsappOptIn` | no | `true` to allow WhatsApp updates |
| `holdToken` | no | From 3.4 |
| `notes` | no | Up to 2,000 characters; staff see it |
| `formAnswers` | no | `{ "<question id>": "answer" }` |
| `useCredits` | no | Default `true`: pay from the client's packages and wallet first. `false` leaves them untouched |
| `purchase` | no | Buy a package in the same call (below) |

```json
{
  "serviceId": "ec04ab46-9f5f-4d7c-b899-8e13d875c229",
  "staffId": "23926164-1d05-45eb-a4d7-554b7db77ec9",
  "start": "2026-10-27T03:30:00.000Z",
  "client": { "name": "Ravi Kumar", "phone": "+919876543210", "email": "ravi@example.com", "whatsappOptIn": true },
  "formAnswers": { "reason": "Stress at work" }
}
```

201 (200 with `Idempotent-Replayed: true` on a retry):

```json
{ "data": {
  "booking": {
    "id": "a5a6fd5b-0c1f-47d6-8659-113376d48d56",
    "reference": "BK-00012",
    "serviceId": "ec04…", "serviceName": "Individual therapy",
    "staffId": "2392…", "staffName": "Rishin P K",
    "start": "2026-10-27T03:30:00.000Z", "end": "2026-10-27T04:30:00.000Z",
    "status": "upcoming",
    "rescheduledFromId": null,
    "payment": {
      "status": "pending", "amountPaise": 100000,
      "dueAt": "2026-10-21T11:15:00.000Z", "resumeUntil": "2026-10-22T11:00:00.000Z",
      "action": "pay",
      "credit": { "credits": 0, "walletPaise": 0 }
    }
  },
  "manageToken": "kJ8s…(random)"
} }
```

**Buy a package and book together:** after Razorpay has taken the package price, add

```json
"purchase": { "packageId": "…", "amountPaise": 360000, "razorpayPaymentId": "pay_ABC", "razorpayOrderId": "order_XYZ", "method": "upi", "paidAt": "2026-10-21T10:59:00Z" }
```

The answer then also has `"purchase": { "purchaseId": "…", "replayed": false }`. If the time was taken (409), the
package stays with the client as credit, so the next attempt needs no new payment.

#### The booking object

| Field | Values |
|---|---|
| `status` | `upcoming`, `completed`, `cancelled`, `no_show` |
| `payment.status` | `pending` (waiting for payment), `paid`, `failed` (time ran out or Razorpay failed), `not_required` (free, or fully paid by credit, or booked at the desk) |
| `payment.amountPaise` | What is left to pay after credit; null if the price isn't a plain amount |
| `payment.dueAt` | Pay by then (pending only) |
| `payment.resumeUntil` | The client can come back and pay until then |
| `payment.credit` | How much package credit and wallet money paid for it |
| `payment.action` | What your page should offer: `pay` (open Checkout now), `resume` (payment failed; call `/resume` then pay), `choose_new_time` (paid, but the time was given away; let them pick a new one and call `/resume` with `start`), `none` |

### 3.6 `GET /bookings?phone=…&view=…`

The client's own bookings. Who is logged in on your website is your decision; pass their phone.

`view`: `pending` (default: the ones that need something: pay, resume or pick a new time), `upcoming`, `past`,
`cancelled`, `all`. Each item is a booking object plus its `manageToken`.

### 3.7 `GET /bookings/{id}`

Header `X-Manage-Token: <manageToken>`. Returns the booking object.

### 3.8 `POST /bookings/{id}/reschedule`

Header `X-Manage-Token`. Body `{ "start": "…", "staffId"?: "…", "holdToken"?: "…" }`. Returns the **new** booking
(new `id` and `reference`); the old one is cancelled and linked by `rescheduledFromId`. Store the new id. 403 inside the
cut-off, 409 if the new time was just taken.

### 3.9 `POST /bookings/{id}/cancel`

Header `X-Manage-Token`. Body optional: `{ "reason": "…" }`. Returns the cancelled booking. Package credit and wallet
money used by it go back to the client. Refunds of online payments are done by you in Razorpay.

### 3.10 `POST /bookings/{id}/payment` (update payment status)

Header `X-Manage-Token`. Report what Razorpay Checkout said, **after verifying its signature on your server**.

| Field | Required | |
|---|---|---|
| `status` | yes | `paid` or `failed` |
| `amountPaise` | yes | What was charged; must equal `payment.amountPaise` |
| `razorpayPaymentId` | for `paid` | `pay_…` |
| `razorpayOrderId` | no | `order_…` |
| `method` | no | `upi`, `card`, `netbanking`… |
| `paidAt` | no | ISO 8601 or Unix seconds; defaults to now |
| `currency` | no | `INR` (default) |
| `errorCode`, `errorDescription` | for `failed` | Razorpay's `error.code` and `error.description` |
| `notes` | no | |

```json
{ "status": "paid", "amountPaise": 100000, "razorpayOrderId": "order_Nabc123", "razorpayPaymentId": "pay_Nxyz789", "method": "upi", "paidAt": "2026-10-21T11:03:00Z" }
```

201:

```json
{ "data": { "booking": { "…": "booking object, payment.status now paid" }, "payment": { "…": "the recorded payment" }, "duplicate": false, "warning": null } }
```

- Same `razorpayPaymentId` again: 200 with `duplicate: true` (nothing changes).
- `warning: "duplicate_payment"`: a second, different payment on a paid booking; flagged for a refund.
- `warning: "choose_new_time"`: paid, but the time had been given to someone else; show times and call `/resume`.
- A `failed` report is recorded only; the client may still pay within the 15 minutes.

`GET /bookings/{id}/payment` (same header) lists every payment reported for the booking.

### 3.11 `POST /bookings/{id}/resume`

Header `X-Manage-Token`. Body optional: `{ "start"?: "…", "staffId"?: "…" }`. For an unpaid booking within 24 hours:
takes the same time again if it is free (or the new `start`) and gives another 15 minutes to pay. Then charge and
report as in 3.10. 409 `slot_unavailable`: ask for another time.

### 3.12 Credits, packages and wallet

- `GET /credits?phone=…`: what the client can still spend.

```json
{ "data": {
  "packages": [ { "id": "…", "name": "4 session package", "creditsLeft": 3, "creditsTotal": 4, "creditValuePaise": 100000, "valueLeftPaise": 270000, "serviceIds": [], "expiresAt": "2027-10-19T18:30:00.000Z" } ],
  "walletPaise": 0, "packageValuePaise": 270000, "totalPaise": 270000, "wallet": []
} }
```

(`serviceIds` empty = any service. One credit covers `creditValuePaise` of a price: a ₹1,500 service takes 1.5 credits
of a ₹1,000 credit.)

- `GET /credits/quote?phone=…&serviceId=…&staffId=…`: how a booking would be paid now, taking nothing:
  `{ "serviceName", "pricePaise", "creditsUsed", "walletPaise", "duePaise", "covered", "uses": [...] }`.
- `GET /packages`: packages on sale: `{ "id", "name", "serviceIds", "credits", "creditValuePaise", "pricePaise", "perCreditPaise", "validityDays" }`.
- `POST /packages/{id}/purchase`: after Razorpay took `pricePaise`:
  `{ "client": { "name", "phone", … }, "amountPaise", "razorpayPaymentId", "razorpayOrderId"?, "method"?, "paidAt"? }`.
  201 `{ "purchaseId", "kind": "package", "clientId", "replayed": false, "credit": { … } }` (200 and `replayed: true` on a retry).
- `POST /wallet/top-ups`: add wallet money after Razorpay took it; same body without the package; the money expires in a year.

### 3.13 OTP over WhatsApp (key with the `otp` scope)

- `POST /otp/send` `{ "phone": "+919876543210" }` (or `{ "phone": "98765 43210", "countryCode": "91" }`) → 201
  `{ "reference": "OTP-REF-…", "phone": "+919876543210", "expiresAt": "…", "expiresInSec": … }`. The code is never in the answer.
- `POST /otp/verify` `{ "reference": "…", "code": "123456", "phone"?: "…" }` → 200 `{ "verified": true }` or
  `{ "verified": false, "reason": "incorrect_code" | "expired" | "too_many_attempts" | "already_used" | "replaced" | "not_sent" }`.
  Unknown reference: 404.

### 3.14 `GET /health`

No key. `{ "status": "ok" }` when the app and database are up; 503 otherwise.

---

## 4. Checklist for the website

- [ ] The API key lives only on your server.
- [ ] A new random `Idempotency-Key` per booking attempt; the same one on retries.
- [ ] Handle 409 (`slot_taken`, `slot_held`) by refreshing availability.
- [ ] Show times in the `timezone` returned by availability.
- [ ] Verify Razorpay's signature before calling `/payment`; send the exact `amountPaise`.
- [ ] Keep `booking.id` and `manageToken` (or read them again from `GET /bookings?phone=`).
- [ ] After a reschedule, use the new booking's `id`.
- [ ] Use `payment.action` to decide what to show: pay, resume, choose a new time, or nothing.
