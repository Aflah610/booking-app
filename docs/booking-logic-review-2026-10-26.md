# Booking-app logic review - 26 October 2026

Reviewed by Codex for Aflah. Code baseline: da2c397 on production main.
Scope: booking/payment transitions, credits, rescheduling, scheduling and case-note eligibility.
This is a findings report. No application code, live records, payments, messages or settings were changed.
OTP migration stays paused with the current website provider retained.

## Validation and limits

- Six offline probes ran actual service/repository functions with synthetic records and in-memory persistence stand-ins.
  They reproduce the control flow and written fields, not PostgreSQL constraints, real Razorpay behaviour or production occurrence.
- Payment probes: zero payment, one-rupee payment, retry after interrupted booking update, Unix-second timestamp.
- Repository probes: reschedule fields and payment-table writes; therapist no-show correction and credit accounting.
- Remaining findings are traced through query predicates, transaction boundaries and database constraints.
  No concurrent production requests or clinical content were inspected. Full database integration tests were not run.
- Read-only live Reports showed five online attempts, all cancelled, zero completed and zero paid.
  These findings do not assert that any real client has already lost money or received an incorrect credit.

## L1 - High: a zero or partial manual payment settles the entire booking

Example: a session costs Rs 1,500. Record Rs 0 or Rs 1 through the manual-payment path. Both probes returned a paid booking.
`payments.schemas.ts:7` permits zero, and `payments.service.ts:64` checks matching amounts only for website reports.
The shared record function then calls markPaid at line 87 for staff payments regardless of amount.
The visible Record a payment form accepts an editable amount and its button says Mark as paid.

Expected: reject zero for a priced session. Either require the full outstanding amount or explicitly support partial
payments and calculate the remaining balance. Do not label the whole session paid after an underpayment.

## L2 - High: an interrupted payment update cannot repair itself on retry

`payments.service.ts:67` saves a receipt; `markPaid` runs separately at line 87 in another transaction.
If the second step fails (for example an application restart or database error), retry finds that receipt and returns
at line 60 without trying to settle the booking. The parallel unique-conflict path at line 83 has the same early return.

Offline probe: first call saved the synthetic paid receipt then threw during markPaid. The same payment retry returned
`duplicate=true` while the booking remained pending. In live operation it could subsequently expire despite a receipt.

Expected: receipt insertion, booking settlement, refund flag and audit should be atomic, or duplicate handling must
reconcile unfinished settlement safely before reporting success. Add a deliberate failure/retry integration test.

## L3 - High: moving an unpaid online booking removes its payment clock

`bookings.repository.ts:290` reschedules by cancelling the old row and inserting a replacement. It copies payment status,
amount and price at line 325, but not paymentDueAt or resumeUntil. `insertBooking` defaults both fields to null (136-137).
The staff path permits moving an unpaid booking. A released failed booking is also inserted with the default live slot.

Offline probe: replacement was pending with paymentDueAt=null and resumeUntil=null. Expiry/cancellation queries no longer
match it; public paymentAction returns none when resumeUntil is null. This can hold an unpaid appointment indefinitely
and remove its normal online payment/resume action. An old Razorpay order also remains associated with the old ID.

Expected: define and preserve the payment lifecycle when staff move an unpaid attempt, including released-slot state,
existing payment links and the deadline. Otherwise explicitly refuse rescheduling until payment is resolved.

## L4 - High: correcting a therapist no-show does not reverse the returned credit

`bookings.repository.ts:368` returns credits when noShowBy=staff. `packages.repository.ts:176-178` marks the uses returned
and zeros the booking's credit fields. Subsequent Undo, Completed or client-no-show transitions do not reclaim that credit
or change the booking's paid label. These correction buttons are visible on the booking detail screen.

Offline probe: mark therapist no-show, then mark completed. The booking ended completed/paid with creditMilli=0;
the package had one restoration update and no subsequent debit. The client could spend the restored credit elsewhere.

Expected: make attendance correction and credit accounting one transition. Reclaim the returned credit atomically, or
require a coordinator to settle the balance if it has already been spent. Do not silently retain a paid label.

## L5 - Medium: rescheduling leaves cash/Razorpay receipt history on the cancelled row

The reschedule path moves `credit_use` through moveCredits but never moves or links payment records to the replacement.
`payments.repository.ts:66` retrieves only exact booking_id matches. Reports export at reports.repository.ts:109 also sums
only that row's payments. The replacement copies paid status while its detail screen can say No payment recorded yet.
Its exported paid amount is null, while the cancelled predecessor retains the receipt.

The repository probe confirmed no payment-table writes during rescheduling. The consequence is traced through the detail
and export queries. This does not mean the money disappeared; the receipt remains on the older row.

Expected: preserve an auditable visit/payment relationship across the reschedule chain, and show it consistently in the
active booking, payment retries, refund workflow and exports without double-counting revenue.

## L6 - Medium: simultaneous requests can bypass gaps and daily limits

Availability checks run in bookings.service.ts:190 before the repository's staff lock at bookings.repository.ts:275.
Inside the lock, claimTime checks overlapping holds only; insert relies on the database overlap constraint.
That constraint covers appointment start/end, not buffers or daily counts. No post-lock availability/count recheck occurs.

Code-traced scenario: a therapist has six of the allowed seven sessions. Two different free times are checked concurrently;
both see six, then sequentially acquire the lock and insert, producing eight. Similarly two simultaneous non-overlapping
sessions with less than the configured 30-minute gap can pass before either exists. Service-wide caps across staff have
the same check/write boundary. This was not executed against PostgreSQL or production.

Expected: revalidate the relevant gap, holds and daily counts inside the transaction after acquiring correctly scoped
locks, including service/day locks for service-wide caps. Add barrier-controlled concurrent database tests.

## L7 - Medium: released failed checkouts can appear as sessions needing clinical notes

`case-history.repository.ts:197-216` finds pending notes by upcoming/completed status, elapsed end time, role and missing
note. It does not exclude slotReleased=true. Failed online attempts retain upcoming status until their 24-hour cancellation.
A near-term failed checkout can therefore appear in Pending case notes after its scheduled end even though its time was
released and no session was confirmed. noteableBookings at line 188 also allows no-shows and released attempts.

This is a query-level finding, not an observed live clinical task. Current live attempts have already cancelled.
Expected: use an explicit held/attended-session predicate consistent with performance reporting and the clinical policy.
Exclude released attempts; define whether missed sessions need a different administrative note.

## L8 - Low: Unix-second payment dates are interpreted as milliseconds

`payments.schemas.ts:15` documents Unix seconds but tries z.coerce.date() first in its union. Numeric values succeed there
as milliseconds, so the seconds-to-milliseconds conversion never runs.
Offline probe: paidAt=1793001600 yielded 1970-01-21T18:03:21.600Z instead of 2026-10-26T08:00:00.000Z.
This applies to numeric API inputs; ISO strings are unaffected. No affected production receipt was established.

Expected: branch on input type before coercion and test ISO strings, Unix seconds and invalid dates.

## Suggested order

1. L1/L2: payment amount and durable settlement/retry.
2. L3/L5: rescheduling payment lifecycle and receipts together.
3. L4: attendance corrections and credits.
4. L6/L7: scheduling concurrency and clinical task eligibility.
5. L8: date parsing.

Fixes require separate focused changes and real database regression coverage. Do not erase historical payments or mutate
production balances as an audit experiment. Review existing records for inconsistencies only after correction rules exist.