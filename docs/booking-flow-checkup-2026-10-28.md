# Booking flow checkup - 28 October 2026

Reviewed by Codex for Aflah. Booking-app baseline: 36f55c2, plus the current website/Worker checkout and live UI.
Outcome: the normal screens and availability work, but the flow cannot be signed off as reliable. Nine functional
findings remain open, plus the live configuration gaps below. No fixes or production data changes in this review.

## Repair status - 28 October 2026

All nine findings below now have fixes and real PostgreSQL regression coverage on
`codex/booking-reliability-fixes`. Local validation passed: 529 tests in 48 files, lint, types, production build and production dependency audit.
Publication and GitHub CI are pending.
The original review below is retained as evidence of the before state, not the repaired behaviour.

- F1/F2/F8: full positive payment amount required; atomic receipt/settlement/retry; Unix-second dates.
- F3/F5/F9: payment clocks, receipts and original signed meeting links survive rescheduling.
- F4/F7: attendance corrections reclaim refunds; failed/released online attempts cannot receive clinical notes.
- F6: concurrent writes recheck buffers and daily caps inside scheduling locks, including cross-staff service caps.
- The temporary Rs 1 prices were separately restored and verified live (see work log). Other configuration gaps
  described below were outside this nine-bug repair.

## What passed

- Local lint and TypeScript checks passed. Twelve database-independent suites passed 117 tests: availability/slots,
  time conversion, email rendering, channel senders, HTTP headers, webhook destinations, OTP delivery and helpers.
- Website Worker tests passed 13 checks covering failed capture, re-fetch, captured payments, webhook retry,
  OTP routing, expiry/session binding and fail-closed behaviour. These were synthetic; no provider messages sent.
- Current production dependency audit: zero reported vulnerabilities.
- GitHub CI for exact booking-app baseline passed the full PostgreSQL-backed test suite, lint, typecheck and build;
  Docker and image publication also passed. This is verification of the completed CI run, not a local re-run of its
  integration tests. Evidence: https://github.com/Aflah610/booking-app/actions/runs/40640901476
- Public booking-app health returned ok. GET /api/v1/bookings without an API key returned 401.
- Public catalogue and staff endpoints work. All seven therapists returned 27 individual slots on 29 October,
  09:00 to 22:00 IST; Jasmin's 90-minute couple service returned 26 slots, ending at 21:30 IST.
  These are offered alternatives, not 27 simultaneous bookings or a daily-limit test.
- Live coordinator flow: Today -> Bookings -> New booking -> Jasmin -> 29 October -> 09:00. Client details and
  Confirm booking form loaded correctly. Did not fill client data, submit, hold a slot or create a booking.
- Christine and Jasmin are Psychologist role. Inactive former MCH psychologists do not appear in public booking.
- Live Settings: online payment and Meet enabled, shared Mindlap Admin calendar selected; its connection has
  Add my bookings and Create Google Meet links enabled. Email shows Connected through Google's SMTP relay.
- All six reminder workflows remain Active for all services: email and WhatsApp at 1440, 180 and 30 minutes.
- Mobile admin layout check: narrow layout exposed the profile menu and Sign out; document width equalled scroll
  width (375 px) on the inspected staff page. Temporary viewport override was reset. This was not every mobile page.
- Browser errors captured on inspected pages came from an unrelated Talisman extension, not the application.

## Reproduced functional bugs

These seven negative probes executed the actual application functions with synthetic repository/query stand-ins.
They prove the control flow and written fields, not PostgreSQL concurrency or that a real client was affected.

| ID | Severity | Finding and reproduced result | Source |
| --- | --- | --- | --- |
| F1 | High | Record Rs 0 or Rs 1 against a Rs 1500 session: the entire booking becomes paid. Two separate probes reproduced this. | src/features/payments/payments.service.ts:64,87; payments.schemas.ts:9 |
| F2 | High | Fail between receipt insertion and booking settlement, then retry the same Razorpay payment: duplicate=true is returned but the booking stays pending. Settlement was attempted only once. | src/features/payments/payments.service.ts:58,67,83,87 |
| F3 | High | Reschedule an unpaid online booking: the replacement remains pending but paymentDueAt and resumeUntil are null. It loses expiry/resume handling and can occupy a slot indefinitely. | src/features/bookings/bookings.repository.ts:294,329; insertBooking:121 |
| F4 | High | Therapist no-show returns a package credit; correcting the booking to completed leaves completed/paid with creditMilli=0. Returned credit is not re-debited. | src/features/bookings/bookings.repository.ts:355,372; packages.repository.ts:returnCredits |
| F8 | Low | paidAt=1793001600 becomes 1970-01-21T18:03:21.600Z instead of 2026-10-26T08:00:00.000Z: coercion consumes Unix seconds as milliseconds. | src/features/payments/payments.schemas.ts:15 |
| F9 | Medium, newly verified | Follow the original signed join link after a reschedule: even when movedToId exists, GET returns HTTP 200 with This session was cancelled and no redirect. A client opening an earlier message cannot follow the moved visit. | src/app/join/[id]/route.ts:28 |

F9 was checked by executing the actual join GET handler with a valid synthetic token check and a cancelled
predecessor whose movedToId points to its replacement. Fix by resolving the reschedule chain to the active visit
while maintaining token ownership checks; cover multiple moves, cancellation and forbidden ownership.

## Code-traced functional findings

These remain from the 26 October review. Current code still contains the relevant paths; production effects and
concurrency were not tested. See docs/booking-logic-review-2026-10-26.md for scenarios and earlier evidence.

- **F5, Medium: receipt history stays on the predecessor after rescheduling.** Reschedule moves credits but does
  not move/link payment rows. Active booking detail and export query exact booking_id, so a paid replacement can
  show no receipt/paid amount. The reschedule probe also observed zero payment-table writes. Sources:
  bookings.repository.ts:329-331, payments.repository.ts:forBooking, reports.repository.ts:exportRows.
- **F6, Medium: concurrent bookings can breach the 30-minute gap or daily caps.** Availability and counts are read
  before the staff lock. Inside the lock only overlap/hold checks repeat; the exclusion constraint covers session
  overlap, not buffers or count limits. Sequential tests do not cover this race. Sources:
  bookings.service.ts:190,216; bookings.repository.ts:83,275-276; availability.service.ts:compute.
- **F7, Medium: released failed checkouts can enter clinical-note lists.** pendingNotes and noteableBookings lack
  slotReleased filtering. A failed near-term checkout can look like a session needing notes before 24-hour cleanup.
  Sources: src/features/case-history/case-history.repository.ts:181,197-214.

## Live configuration gaps

1. **Test prices are still public.** Both individual and couple base prices are Rs 1, and the previous Rashin override
   has not been restored by this audit. Public catalogue returned only the two single sessions. The Worker filters
   packages unless their creditValuePaise matches the selected session price (worker/src/waky.js:163), so the normal
   package options disappear at the temporary price. Restore only when Aflah says testing is finished: individual
   Rs 1000, couple Rs 1500, Rashin's explicit individual override Rs 1000. Products themselves were not repriced.
2. **Only reminders are configured.** The live list contains six appointment_start workflows and no booked,
   payment_success, rescheduled or cancelled message workflow. Therefore no immediate confirmation/change/cancel
   notification is configured through this engine. The website's confirmation screen is separate. If that message
   flow is wanted, create and test it explicitly; do not assume the reminders provide it.
3. **Firm name is My firm.** The live Settings input still contains the default name. Branded email headers/footers
   interpolate that setting (email-design.ts:156-160), so correct sender/template body text alone does not ensure
   consistent Mindlap branding. Brand colour is also still the default black. No settings saved in this checkup.

## Reliability and deployment limits

- Booking/payment events enqueue calendar and workflow jobs after the booking transaction. Failures are logged
  and swallowed; the scheduler retries queued jobs but there is no durable event outbox to recreate an enqueue
  that never committed. Treat this as a reliability follow-up, not evidence of a currently failed live reminder.
- Join URLs can be formed before Meet exists. Connection/settings being present does not independently verify
  Google token refresh, an actual new Meet creation or a therapist's ability to admit a client today.
- SSH was unreachable from the current network. This audit did not alter the firewall, inspect server secrets,
  tail production logs or prove the exact deployed revision directly over SSH.
- No real OTP, payment, client mutation, provider message, cancellation or reschedule was performed. The complete
  authenticated customer journey through a new captured charge and delivered confirmation was not exercised.
- Local integration suite could not run: this machine exposes no local PostgreSQL/Docker tooling. Used exact-head
  successful PostgreSQL CI as integration evidence, local pure tests and the seven offline negative probes.
- Automatic approval review rejected a proposed unauthenticated POST to the live sessions endpoint because it
  might cause production-side effects. Removed it; continued with GET-only live checks and offline regressions.
- MCH is real clinical data now (latest handover: 303 clients, 209 case histories, 414 notes). No client tables or
  clinical contents were exported/read for this audit. The earlier reset is complete and must not be repeated.

## Recommended repair order

1. F1/F2: payment amount validation, atomic settlement and retry reconciliation.
2. F3/F5/F9: rescheduling payment clocks, receipt continuity and original join links together.
3. F4: attendance corrections and credit accounting in one transaction.
4. F6/F7: transactional availability checks and real-session clinical-note eligibility.
5. F8 plus the confirmed live configuration gaps; then one controlled owner booking to exercise providers.

No claim of a bug-free flow. Each repair needs focused PostgreSQL regression coverage before publication.