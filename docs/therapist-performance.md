# Therapist Performance Calculator (TPC)

Reports > **Therapist performance** (managers and admins). It shows, per therapist and for a chosen period
(10 days, 30 days, 90 days, 6 months, 1 year, always counted back from now):

| Column | Meaning |
|--------|---------|
| Sessions | Sessions held in the period, and with how many clients |
| After 1st ... 6th | Of the clients whose Nth session with this therapist fell in the period, the share who came back for another |
| Terminated | Of the clients seen in the period, the share whose treatment has ended |
| Punctuality | How soon after the scheduled start the therapist joined the call (needs Google Meet, see below) |

## Definitions

- **A session counts** when it is marked completed, or not marked at all and already over. Cancelled bookings (including the
  original of a moved session), no-shows and slots given back after a failed payment never count.
- **A journey** is everything one client has had with one therapist. Each journey is counted on its own, so a client who moves to
  another therapist counts as not coming back to the first.
- **Came back after the Nth session** means a later session exists, held or already booked. If there is none yet and the Nth
  session is newer than the grace period (30 days), the client is *waiting*: shown, but left out of the rate. After that they are *lost*.
  `rate = returned / (returned + lost)`.
- **Terminated**: a client with a session in the period, nothing booked ahead, and a last session older than the grace period.
  This covers a successful completion *and* an early termination. The app does not record which yet.

## How it is built

```
performance.repository.ts   only file that reads the database: every session that counts
performance.engine.ts       pure functions: one journey per therapist and client, "Nth session", "last session"
kpis/                       one small file per metric, each with the same shape (see kpi.ts)
performance.service.ts      loads once, runs each KPI per therapist, returns the report
attendance.ts + the port    AttendanceSource: where join times come from (empty for now)
```

The engine and the KPIs are pure, so most rules are tested without a database (`tests/performance-engine.test.ts`);
`tests/performance.test.ts` runs the whole thing on real bookings.

### Adding a KPI

1. Add `kpis/<name>.ts` exporting a `Kpi` (give it an id, a label and `compute(ctx)`), and its result type in `performance.dto.ts`.
2. Register it in `kpis/index.ts`, call it from `performance.service.ts`, and add the field to `TherapistReport`.
3. Add its column to `src/app/admin/reports/therapists/page.tsx` and a test beside the others.

### Connecting Google Meet (punctuality)

The punctuality KPI is finished and waits for join times. To feed it, write an `AttendanceSource` whose
`forBookings(bookingIds)` returns, for each booking, when the **therapist** joined the call, and pass it to
`createContainer(db, { attendance })` in the place the container is created for the app. Roughly:

1. Each booking's Meet link holds a meeting code. Look up the meeting space from it with the Google Meet REST API.
2. List that space's conference records and their participants and participant sessions; take the therapist's earliest start time.
   (Check Google's current Meet REST API reference before building; the account needs read access to meeting spaces and conference records.)
3. Return `new Map([[bookingId, { joinedAt }]])`. Bookings the API knows nothing about are simply left out.

Nothing else changes: the column switches from "Not connected yet" to the on-time share by itself.

## Ideas for later

- Record an outcome per client (successfully completed, terminated early, referred) so "Terminated" can be split into successful completion and early termination.
- A single weighted score per therapist, built from these KPIs (needs the firm to agree what matters most).
- Punctuality of the client, and a lateness trend per therapist.
