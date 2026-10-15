# Staying correct and fast under heavy traffic

How the booking engine will hold up when many people book at once. This is our own design. Looking at how
the old open-source Cal.com code structured its booking logic gave us ideas, but nothing here copies or
imitates its code, and several choices go further (for example the exclusion constraint below). It is sized
for a 30-person firm whose website can still get traffic spikes.

## The rule that matters most: never trust the slot list

The slot list a client sees is a hint. It can be seconds old. So:

1. **Re-check at booking time.** Creating a booking recomputes availability for that one staff member and
   time, inside the request.
2. **Let Postgres have the final word.** Two requests can pass step 1 at the same moment. The
   `booking_no_overlap` exclusion constraint makes the second insert fail, and we answer `409 slot_taken`.
   Because it compares time ranges, it also catches partial overlaps (9:00 to 9:30 against 9:15 to 9:45).
3. **Make retries safe.** The website sends an `Idempotency-Key` header on create. It's stored with a unique
   index on `booking.idempotency_key`; a retry returns the original booking instead of a second one.

## Short holds while the client fills in the form

When a client picks a time, the website can call `POST /api/v1/slot-holds` to hold it for 5 minutes Other clients stop seeing that slot; the booking request
presents the hold token. Holds that expire are ignored by queries and deleted by a cleanup job. Table:
`slot_hold` (already in the schema).

## How slots are computed

Per staff member, for the requested date range:

1. Turn weekly hours (in the staff member's time zone) into concrete UTC ranges for each date, applying
   date overrides.
2. Gather busy ranges: bookings (with each service's buffers), time off, active holds, Google Calendar busy
   times.
3. Sort and merge busy ranges once, then subtract them from the working ranges in a single sweep:
   O(n log n), never pairwise.
4. Cut the free ranges into start times using the service's slot interval, dropping anything inside the
   minimum notice or beyond the booking window.
5. "Any available" staff: compute each person's slots and union them, then pick by workload when booking.

This is pure code with no database calls, so it gets exhaustive unit tests (DST changes, buffers at range
edges, overrides, holds).

## Caching

- **Slot responses** are cached for a couple of seconds, keyed by the exact query. That absorbs bursts of identical requests without serving stale data for long. If the cache fails,
  we compute directly; the cache can never break booking.
- We start with an in-process cache (one container). If we run several containers, the same interface gets
  a Redis or Postgres-backed implementation.
- **Google Calendar busy times** are synced into our own table using Google's push notifications and sync
  tokens, so a slot request never waits on Google's API.

## Background work

Messages, calendar writes, reminders and cleanup never run inside the booking request. They go on a queue
(pg-boss in the same Postgres) behind a small `tasker` interface, with retries, delays and cancellation A failed WhatsApp send can't fail a booking.

## Database

- Indexes match the hot queries: bookings by staff, status and start (`booking_staff_status_starts_idx`),
  by status and start for lists, and the exclusion constraint's GiST index for overlap checks.
- Repositories select only the columns they need.
- Neon's pooled connection string keeps connection counts low when the app scales out.

## Protecting the public API

- Rate limits per API key and per client IP on availability, holds and booking creation (phase 3).
- If the website ever calls us from the browser, a scoped public key plus CAPTCHA on booking.

## When each piece lands

| Phase | Pieces |
|-------|--------|
| 1 (now) | Exclusion constraint, idempotency column, slot-hold table, indexes, layered code |
| 2 | Slot engine with unit tests, booking service with re-check and 409, holds, Google Calendar sync and cache |
| 3 | Idempotency-Key handling, slot cache, rate limits, pg-boss tasker for messages and cleanup |
| 4 | Load test of availability and booking under concurrent requests before launch |
