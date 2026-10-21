# Client profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesigned client page (activity tabs on the left, general info and therapist history on the right) backed by new client fields and a therapist-assignment history.

**Architecture:** New columns on `client` and a new `client_therapist` table; the `clients` slice gains profile editing, therapist assignment and a pure `clientStatus()` helper; the page at `src/app/admin/clients/[id]` is rebuilt from server components with `?tab=` and `?bookings=` query params (no client JS).

**Tech Stack:** Next.js (this repo's version), Drizzle + Postgres, Zod, Vitest against real Postgres, Tailwind classes from `globals.css`.

**Spec:** `docs/superpowers/specs/2026-10-21-client-profile-design.md`

## Global Constraints

- Only `*.repository.ts` imports Drizzle or `@/db/schema`; services throw `DomainError` with `not_found | invalid | conflict`.
- A write and its `audit_log` row commit in one transaction; audit details name changed fields, never personal values.
- Client personal data lives only in `client`. No new fields in public API responses.
- Timestamps `timestamptz` UTC; `date_of_birth` is a `date`.
- Client ID shown as `CL-` + 5 digits (`CL-00142`).
- Page access unchanged: `requireStaff("manager")`.
- `npm run lint`, `npm run typecheck`, `npm test` pass.

## Review Focus

- Existing clients get numbers in `created_at` order and new clients continue after the highest, with no collision → migration test asserts order and next value.
- Two reassignments racing leave exactly one open period → partial unique index; test asserts the second open insert fails.
- A former (inactive) therapist in history still renders with "former staff" → page reads history with `active` flag; service test asserts history keeps inactive staff.
- Blank form fields save as null, not empty strings → schema test with `""` values.
- Emergency phone without country code becomes +91 E.164; garbage is `invalid` → schema test.

---

### Task 1: Schema and migration

**Files:** Modify `src/db/schema.ts` (client table, new `clientTherapist`); Create `drizzle/0024_client_profile_fields.sql` via `npm run db:generate -- --name client_profile_fields`, then edit it before commit; Modify `tests/helpers.ts` (truncate list adds `client_therapist`); Test `tests/client-profile.test.ts`.

**Produces:** `client.number` (`integer`, `generatedByDefaultAsIdentity`, unique, not null), `dateOfBirth` (`date`, mode string), `gender`, `maritalStatus`, `occupation`, `education`, `location`, `languages`, `emergencyName`, `emergencyRelation`, `emergencyPhone`, `referralSource` (text), `consentSignedAt` (timestamptz), `registeredBy` (uuid → staff, set null). `clientTherapist` table: `id`, `clientId` (cascade), `staffId`, `startsAt`, `endsAt` null, `assignedBy` (→ staff, set null), `reason`; partial unique index `client_therapist_open_idx` on `client_id` where `ends_at is null`.

- [ ] Generate the migration, then edit it so existing rows are numbered `row_number() over (order by created_at, id)` and the identity sequence is `setval` to max+1.
- [ ] Test `numbers existing clients by sign-up order and continues after them`: insert clients, run nothing extra (migration ran in global setup on an empty db), so assert new clients get consecutive numbers and `number` is unique. (Backfill order is checked by hand against Neon after deploy.)
- [ ] Test `allows only one open therapist period per client`: insert two open rows for one client → second rejects.
- [ ] `npm test -- client-profile` passes; commit `feat(clients): profile fields and therapist history tables`.

### Task 2: Profile fields in the clients slice

**Files:** Modify `clients.dto.ts`, `clients.schemas.ts`, `clients.repository.ts`, `clients.service.ts`; Test `tests/client-profile.test.ts`.

**Produces:** `ClientDTO` gains `number: number` and every Task 1 field (`dateOfBirth: string | null`, …, `registeredBy: string | null`). `clientReference(number: number): string` → `"CL-00142"` in `clients.dto.ts`. `clientProfileInput` (Zod) for the edit form: all optional; `""` → null; `dateOfBirth` `YYYY-MM-DD`, not future, not before 1900-01-01; `emergencyPhone` uses the existing `phone` schema; `consentSignedAt` date string → Date. `clients.updateProfile(actor, id, input: unknown): Promise<ClientDTO>` merges with the existing `update` fields (name, email, whatsappOptIn, notes).

- [ ] Tests: `saves the full profile and reads it back`; `turns blank fields into null`; `rejects a birth date in the future or before 1900` (`invalid`); `stores the emergency phone as E.164` (`"98765 43210"` → `"+919876543210"`); `clientReference(142)` = `"CL-00142"`; audit row lists field names only.
- [ ] Implement; tests pass; commit `feat(clients): edit the full client profile`.

### Task 3: Therapist assignment

**Files:** Modify `clients.repository.ts`, `clients.service.ts`, `clients.dto.ts`; Test `tests/client-profile.test.ts`.

**Produces:** `TherapistPeriodDTO = { id; staffId; staffName; designation: Designation | null; staffActive: boolean; startsAt: Date; endsAt: Date | null; assignedByName: string | null; reason: string | null; sessions: number }`. `clients.therapistHistory(clientId): Promise<TherapistPeriodDTO[]>` newest first; `sessions` = completed bookings with that staff in the period. `clients.assignTherapist(actor, clientId, { staffId, reason? }): Promise<void>`: closes the open period and opens the new one at the same `now` in one transaction with audit `assign_therapist`.

- [ ] Tests: `first assignment needs no reason`; `replacing needs a reason` (`invalid`); `assigning the current therapist again is a conflict`; `an inactive staff member cannot be assigned` (`invalid`, message names the id); `history keeps a therapist who has since left, newest first, with sessions counted`.
- [ ] Implement; tests pass; commit `feat(clients): assign a therapist and keep the history`.

### Task 4: Client status helper

**Files:** Create `src/features/clients/client-status.ts`; Test `tests/client-profile.test.ts`.

**Produces:** `clientStatus(bookings: { status: BookingStatus; startsAt: Date }[], now: Date, graceDays = DEFAULT_GRACE_DAYS): "not_started" | "in_therapy" | "concluded"` (rules in the spec header section).

- [ ] Tests for each of the three outcomes, including a cancelled-only client = not started.
- [ ] Implement; commit `feat(clients): work out whether a client is in therapy`.

### Task 5: The page

**Files:** Rewrite `src/app/admin/clients/[id]/page.tsx`; Create `src/app/admin/clients/[id]/edit/page.tsx`; Create `src/components/ClientCredits.tsx` (the current credits block moved verbatim); Modify `src/app/admin/actions.ts` (`updateClientProfileAction`, `assignTherapistAction`).

- [ ] Layout per the spec and prototype: left tabs `?tab=case|bookings|credits`, bookings sub-tabs `?bookings=upcoming|past|cancelled` using `BookingRow`; right column ID and phone boxes, five key rows, `<details>` for "Show all details", Edit link, therapist card, `<details>` reassign form (active staff select + reason), "Previously" list.
- [ ] Case history tab: empty state "No case history yet." only.
- [ ] `npm run lint && npm run typecheck && npm test` pass; check the page in `npm run dev`; commit `feat(clients): redesigned client page`.

### Task 6: Deploy

- [ ] `docker build --platform linux/amd64 -t booking-app:latest .`; confirm the CLI is logged in as ameen@thewaky.com and `.catalystrc` points at `wakyboooking`; `catalyst deploy appsail --name <the existing AppSail name> --source docker://booking-app:latest -ni`.
- [ ] Check `/api/v1/health` returns ok, open a client page, and check client numbers on Neon follow sign-up order.
