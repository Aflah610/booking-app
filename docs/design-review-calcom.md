# Booking app design vs. cal.com (code from before it closed)

**Reference:** cal.com repository at commit `c0d105e7`, 14 April 2026, the last commit before the project
closed its source. This is the full product, including its `ee/` folder (round robin, workflows, teams). It is
not Cal.diy.

**Rule:** we read it only to understand how the logic is structured. No code is copied or imitated; every
item below is our own design, sized for a 30-person firm whose website can see traffic spikes.

**Repo:** `wakycoo-design/boookingapp`, draft PR #1. Items marked **Done** are already in that PR.

## 1. Availability and slots

| How cal.com does it | Our design | Change |
|---|---|---|
| Builds concrete date ranges from weekly hours in the host's time zone, then **subtracts** busy ranges (bookings, calendars, out of office, holidays) and cuts slots from what's left | Same pipeline, written as pure functions on sorted ranges (sort once, then merge or subtract in a single pass) | None |
| **Date overrides** replace the weekly hours for one specific date entirely | We only had time off, which can block time but not add extra hours on a day | **Phase 2:** add a `date_override` table (date, start, end; no rows = unavailable that day) |
| Slot starts are aligned to the interval (10:00, 10:15…), not to whenever the free range happens to start | We hadn't specified this | **Phase 2:** align starts to the service's interval, measured in the staff member's time zone |
| Per-event minimum notice, booking window, buffers and slot interval | Done (per-service fields, falling back to business defaults) | **Done** |
| Booking and duration limits per day, week or month | In the plan as v2 | Keep v2 |
| Short cache of slot answers that never blocks booking if the cache fails | Same idea, about 2 seconds, in-process first | None |

## 2. Booking lifecycle

| How cal.com does it | Our design | Change |
|---|---|---|
| Statuses accepted, pending (needs confirmation), cancelled, rejected, awaiting host | upcoming, completed, cancelled, no_show | Keep ours. The firm doesn't approve bookings, so no pending state. Add one in v2 only if wanted |
| A public, unguessable `uid` per booking; an April 2026 fix made cancelling require it | Our id is a random UUID and the display number is BK-00012. Client actions go through a hashed magic-link token | None. The public API never accepts the display number for client actions |
| Re-checks every host's availability inside the booking request | Same, in the booking service | None |

## 3. Reschedule and cancel

| How cal.com does it | Our design | Change |
|---|---|---|
| Reschedule = **new booking + old one marked cancelled** with `rescheduled = true`, linked by `fromReschedule` | We planned to move the booking in place | **Phase 2:** switch to new booking + old one cancelled, linked by `rescheduled_from_id` (column **Done**). History and reminders stay clean |
| The busy-time lookup ignores the booking being rescheduled, so moving it 15 minutes doesn't clash with itself | Our overlap constraint would block that move if the old booking were still active | **Phase 2:** cancel the old booking and insert the new one in one transaction, old row first, so the constraint sees no clash and the move is all-or-nothing |
| Refuses to cancel twice, and refuses to cancel a booking that has already ended | Not specified | **Phase 2:** both rules in the booking service, with tests |
| Doesn't trust a "cancelled by" email sent by a guest; attributes the action to the signed-in user or the token holder | Our audit log records the staff member or API key, never a free-text name | None (already safe) |
| Optional rule that a cancellation reason is required | Not planned | Add as a business setting in v2 if the firm wants it |

## 4. Concurrency and double-booking

| How cal.com does it | Our design | Change |
|---|---|---|
| Unique `idempotencyKey` built from start, end and host; a duplicate insert returns 409 | A Postgres **exclusion constraint** on time ranges per staff member. It is stronger because it also blocks partial overlaps. Tested: 20 simultaneous inserts for one slot, exactly 1 succeeds | **Done** |
| — | A separate `Idempotency-Key` header from the website, so a retried request returns the original booking | **Done** (column); handling in phase 3 |
| `SelectedSlots`: a 5-minute hold while the booker fills in the form | `slot_hold` table with a hashed token and a release time | **Done** (table); API in phase 2 |

## 5. Notifications and queues

| How cal.com does it | Our design | Change |
|---|---|---|
| Reminders stored ahead of time with a scheduled date, cancelled or rescheduled with the booking | Notification rows with `scheduled_for`, replaced on reschedule and deleted on cancel in the same transaction | **Done** (columns and index) |
| Task table with attempts, max attempts, last error, and a **unique key per task** so the same job is never queued twice | pg-boss for retries and backoff, plus a unique `dedupe_key` on notifications (e.g. `<booking>:reminder_24h:whatsapp`) | **Done** (column) |
| The task worker fetches a batch without row locking, so two workers could pick up the same task | pg-boss locks rows with `SKIP LOCKED`, so each job runs once even with several containers | Our choice is safer; nothing to change |
| Channel-specific managers (email, SMS, WhatsApp) behind one dispatcher | One notification adapter per channel (WhatsApp first, email as fallback) | None |

## 6. Calendar sync

| How cal.com does it | Our design | Change |
|---|---|---|
| Watches Google calendars with push channels; stores channel id, expiry, sync token and error counts, and renews channels before they expire | We only had `calendar_connection.sync_cursor` | **Phase 2:** add channel id, channel expiry, last sync time and error count; a scheduled job renews channels |
| Copies events into a local cache table, so slot requests never call Google | Same plan | **Phase 2:** add a `calendar_busy` table (staff, external id, start, end) |
| Stores each booking's external calendar event id (`BookingReference`), so a reschedule or cancel updates the right event | Not in our schema | **Phase 2:** add `booking_calendar_event` (booking, provider, external event id) |
| Separates "calendars to check for busy" from "the calendar to write bookings to" | One Google calendar per staff member | Keep it simple: check the primary calendar and write to it. Add selection in v2 if staff ask |

## 7. Public API

| How cal.com does it | Our design | Change |
|---|---|---|
| Versioned API; breaking changes go behind a new date-based version header | `/api/v1` path versioning, with a rule against breaking changes | None |
| Per-API-key rate limits with block duration, stored in Redis; booking also limited per hashed client IP | Planned for phase 3 | **Phase 3:** limits per key and per hashed client IP, stored in Postgres (one container) or Redis (several), returning 429 with `Retry-After` |
| Hashed API keys with a recognisable prefix | Done (`bk_` prefix, SHA-256 hash) | **Done** |

## What changes, in short

Already in the PR: per-service booking rules, idempotency and reschedule columns, slot holds, reminder
scheduling, a dedupe key for notifications, and query indexes.

Phase 2 additions:
- date overrides
- slot start alignment
- reschedule as new booking + cancelled old one, in one transaction
- refuse cancelling twice or after a booking ends
- Google watch-channel fields, a busy-time cache and stored calendar event ids

Phase 3: rate limits per key and per hashed IP.

## Deliberately not adopted

- Seats, group bookings, collective and round-robin teams beyond a fair "any available" pick (v2 at most)
- Routing forms, an app store, organisations, payments
- tRPC and a NestJS second API (one Next.js app is enough at this size)
