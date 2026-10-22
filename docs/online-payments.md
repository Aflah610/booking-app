# Online payments (Razorpay runs on your website)

Waky Booking never talks to Razorpay. Your website opens Razorpay Checkout and **reports the result to us**; we
keep the details against the appointment (Razorpay order ID, payment ID, amount, method, time) and run the clock.

Turn it on in **Settings > Online payment**. Then a website booking of a service with a plain price (for example
`1500` in the service's price box) is held until a payment is reported. Services with no price, price text like
"From ₹500", and bookings made at the desk are not held.

## The flow

| Step | Who | Call |
|------|-----|------|
| 1 | Website | `POST /api/v1/bookings` as before. The booking comes back with `payment: { status: "pending", amountPaise, dueAt, resumeUntil, action: "pay" }` and a `manageToken`. Keep both with your logged-in client. |
| 2 | Website | Create the Razorpay order for `amountPaise` and open Checkout. |
| 3 | Website | `POST /api/v1/bookings/{id}/payment` (header `X-Manage-Token`) with Razorpay's result, below. |
| 4 | Us | A `paid` report confirms the booking: status **Paid**, confirmation workflows run. |
| – | Us | **10 minutes** (`dueAt`) with no paid report: **Payment failed**, the time goes back on offer, a `payment_failed` workflow can email the client. |
| – | Website | When the client logs in: `GET /api/v1/bookings?phone=+91…` lists their bookings with `payment.action` of `resume` (or `choose_new_time`). |
| – | Website | `POST /api/v1/bookings/{id}/resume` with `{ "start"?: "2026-10-20T10:00:00Z", "staffId"?: "…" }`. We take the same time again if it is free, or the new `start`. They get another 10 minutes to pay: repeat steps 2 and 3. |
| – | Us | **24 hours** after the booking (`resumeUntil`) still unpaid: the booking is cancelled. A paid booking is never cancelled automatically. |

`payment.action` tells the website what to show: `pay` (inside the 10 minutes), `resume` (failed, can come back),
`choose_new_time` (paid, but the time was given away: call `/resume` with a new `start`), or `none`.

## Reporting a payment

`POST /api/v1/bookings/{id}/payment`

```json
{
  "status": "paid",
  "amountPaise": 150000,
  "razorpayOrderId": "order_Nabc123",
  "razorpayPaymentId": "pay_Nxyz789",
  "method": "upi",
  "paidAt": "2026-10-15T08:03:00Z",
  "currency": "INR"
}
```

For a failed try send `"status": "failed"` with `errorCode` and `errorDescription` (Razorpay's `error.code` and
`error.description`). A failed report is only recorded: the client may still retry within the 10 minutes.

- `amountPaise` must equal the booking's amount, or you get a **400** with `details.reason = "amount_mismatch"`.
- The same `razorpayPaymentId` reported twice is counted once (**200**, `duplicate: true`), so retry freely.
- **409** `booking_cancelled`: money was taken for a booking already cancelled. It is recorded and flagged
  **Refund this in Razorpay** on the booking page.
- `warning: "duplicate_payment"`: a second, different payment on a paid booking, flagged for refund.
- `warning: "choose_new_time"`: paid, but the time had been given to someone else. Show the client the slots and call `/resume`.
- `GET /api/v1/bookings/{id}/payment` lists everything reported for the booking.

## Staff

Open a booking: **Payment** shows the amount due, the pay-by and resume-until times, and every payment with its
Razorpay IDs. **Record a payment** lets staff enter one by hand (cash, a transfer, a payment the website couldn't
report). Reports (CSV) include amount due, amount paid, Razorpay payment ID and paid-at time.

## Workflows

New triggers: **Payment received** and **Payment failed**. New variables: `{{amount}}` and `{{resume_link}}`. The
resume link is your website page (set in Settings > Online payment) with `?booking=<id>&token=<token>` added;
your page then calls `/resume` with that token. "Booking is made" confirmations are sent only after payment for
online bookings. Starter templates: *Complete your payment* and *Payment received*.

## Things to know

- The 10-minute and 24-hour clocks are checked every 30 seconds by the app's worker, and also whenever the
  website calls `/resume`, `/payment`, or lists a client's bookings, so they hold even if the worker is down.
- A "payment failed" message is sent once per booking, even if the client fails again after resuming.
- The built-in `/book` page doesn't take payments: while online payment is on it asks clients to book paid
  services on your website.
