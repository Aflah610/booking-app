# Engineering rules

This file is read by **Codex** (AGENTS.md) and by **Claude Code** (CLAUDE.md imports it). Both work on this
project for the same owner, Aflah.

## Working together (Codex and Claude Code)

- **Before you start:** `git pull`, then read the newest entries in `docs/WORKLOG.md`.
- **When you finish:** commit, and add an entry at the top of `docs/WORKLOG.md` (date, agent, what changed,
  what is live, what is open), written for the other agent, which has none of your chat history.
- **One agent per task.** If the log shows the other agent mid-way through something, leave those files alone.
  For bigger work use your own branch or `git worktree`; never leave uncommitted changes when you stop.
- **Migrations:** two agents generating a migration at once get the same number. Pull first, generate, commit
  and push straight away; if numbers clash, delete yours and generate again on top.
- Secrets (API keys, SSH keys, database URLs, `app.env`) never go in the repo, this file or the log.

## Mindlap facts

- Shared ecosystem context and outstanding work: `docs/OVERVIEW.md`. Check the work log for newer updates.

- Live at `https://book.mindlap.in` on an AWS Lightsail server in Mumbai with Lightsail Postgres. The server
  deploys `main` by itself every 5 minutes, **only after GitHub CI ("check": lint, typecheck, tests, build)
  passes**. Run `npm run lint` before pushing; a lint error stops the deploy.
- On the server never run git as root (`sudo git ...` in `/opt/mindlap/src`); it breaks the deploy job.
- Never write to the old Neon `DATABASE_URL`: it is test data only.
- Roles: admin, manager, psychologist, BDE (sales), CCD. Permissions in `src/features/access/permissions.ts`,
  editable by the admin. Only CCD books for clients; psychologists see only their own clients, without
  contact details; managers see only *pending* case notes (a note is due 24 hours after the session).
- Calendar is paid-only for every role: query paymentStatus=paid before limits and exclude cancelled/released
  slots. Fully package/wallet-covered sessions are paid; pending, failed, partial-credit and free/not_required
  attempts stay out of Calendar. Their records remain available in Bookings for recovery and audit.
- Availability is controlled by managers, CCD and admins (availability.manage), never by psychologists
  by default, including their own hours, date overrides and time off. /admin/availability is the therapist
  picker; CCD availability access does not grant staff-profile, role, price or Google-connection management.
  Google connect/callback/options/sync/disconnect require staff.manage even for the person's own calendar.
- Therapist views follow their permissions on every page and direct URL: own diaries, own client-session history
  and own performance only by default. Never fetch/display firm totals or other staff filters without bookings.all.
  Apply clients.contact to report pages, CSV and search matching, not just visible labels. Client credit controls
  require packages.manage; shared-client access does not grant access to another therapist's sessions or Meet links.
- Booking rules (live data, not code): psychologists 9:00 to 23:00, 30-minute gap after every session,
  at most 7 sessions per psychologist per day (Settings > Booking rules). Individual therapy 60 min,
  couple therapy 90 min.
- Clients lists registered clients: successful paid/free online bookings, staff registrations, imports or existing care/credits.
  Unpaid online booking attempts stay in Bookings; sales-only contacts stay in Leads. A blank case record is not registration.
- Confirmed website bookings (paid/free), fully credit-covered bookings and recorded payments assign the booked
  therapist only when the client has no current assignment. Pending/failed checkouts do not assign anyone.
  Keep existing assignments; changing therapist remains an explicit coordinator action with a reason.
- Case history mirrors the old system MCH (6 steps). MCH data is copied with `scripts/import-mch.ts`
  (dry run by default). Never print or log clients' clinical text.
- The website (`mindlap.in`, repo `mindlap-therapy`) talks to this app through its Cloudflare Worker.

Rules for anyone (person or AI agent) changing this codebase. They are our own. We looked at how the old
open-source Cal.com code organised its logic for ideas only. Never copy or imitate its code; design our own
solution for each problem.

## Architecture

- **Vertical slices.** Code is organised by domain under `src/features/<domain>/`, not by technical layer.
  Each slice holds its own DTOs, input schemas, repository and service:
  `staff`, `catalog` (services clients can book), `schedules` (weekly hours, date overrides, time off),
  `availability` (the pure slot engine in `slots.ts` plus loading), `bookings` (create, holds, reschedule,
  cancel), `clients`, `settings`, `api-keys`, `audit`, `health`. Notifications arrive as a new slice.
- **Repositories are the only code that knows about the database.** Only `*.repository.ts` files import
  Drizzle or `@/db/schema`. They select explicit columns, return DTOs, and contain no business rules.
- **Services hold the business rules.** `*.service.ts` files validate input, enforce rules and call
  repositories. They never import Drizzle.
- **Dependencies are injected.** Services receive their repositories as arguments
  (`createStaffService({ staffRepo })`). `src/features/container.ts` is the one place that wires them;
  `app()` returns the wired container. Swapping storage means writing new repositories, nothing else.
- **DTOs at every boundary.** Database row types never reach pages, components or API responses. Public API
  responses use their own narrower DTOs (`toPublicService`, `PublicStaffDTO`).
- **Thin controllers.** API routes (`src/app/api/v1/**`) and server actions (`src/app/admin/actions.ts`)
  only parse the request, check access, call a service and shape the response.
- **Permission checks live in pages and actions**, never only in layouts.
- **Atomic changes.** A write and its `audit_log` row commit in the same transaction inside the repository.
- **Postgres guards the invariants it can.** Overlapping bookings are blocked by the `booking_no_overlap`
  exclusion constraint, not only by application checks.
- **Portable by default.** No host-specific SDKs in features. Settings and secrets come from environment
  variables (document each in `.env.example`). Background jobs will use pg-boss in the same Postgres.

## Time and scheduling

- Store every timestamp as `timestamptz` in UTC. Convert to a time zone only at the edges.
- Each staff member has their own IANA time zone; weekly hours are wall-clock times in that zone.
- Scheduling gets expensive fast. Work with sorted date ranges (sort once, sweep or merge) and never loop
  pairwise or minute-by-minute. Look for O(n²) before merging anything in `schedules` or bookings.
- Per-service rules (slot interval, minimum notice, how far ahead) override business defaults; `null` means
  "use the business setting".
- Tests run with `TZ=UTC` (the `npm test` script sets it) so they behave the same everywhere.

## API

- Everything public is under `/api/v1`. Never make a breaking change to a published endpoint; add a new
  field or a new version instead.
- Responses are `{ "data": ... }` or `{ "error": { "code", "message", "details?" } }`. JSON and ISO 8601 only.
- A `website` key never sees staff emails, internal notes or other clients' data.
- API keys are stored as SHA-256 hashes and shown once, at creation.
- Creating a booking will require an `Idempotency-Key` header (stored in `booking.idempotency_key`).

## Errors

- Throw `DomainError` with a code (`not_found`, `invalid`, `conflict`, `forbidden`) from services. Routes map
  the code to an HTTP status.
- Messages say what failed and for what: `Staff member 123 not found`, not `Not found`.

## Code quality

- TypeScript strict. Never use `as any`; use `import type` for type-only imports.
- Comments explain why, not what.
- Validate all input with Zod at the boundary.
- Client personal data lives only in the `client` table.
- No secrets in code, tests, logs or commits.

## Database changes

- Edit `src/db/schema.ts`, run `npm run db:generate -- --name <what_changed>` and commit the SQL in
  `drizzle/`. Never edit a migration that has been merged; add a new one.
- Anything Drizzle can't express (exclusion constraints, extensions) goes in a custom migration
  (`npx drizzle-kit generate --custom --name <name>`).

## Pull requests

- `npm run lint`, `npm run typecheck` and `npm test` pass before every PR. CI also builds the app and image.
- Keep PRs small: under about 500 changed lines and 10 code files (lock files, migrations and docs don't
  count). Split by layer or by dependency order when a change is bigger.
- Open PRs as drafts; describe what a user would see before and after.
- Tests run against a real Postgres, not mocks. Every rule in a service gets a test.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
