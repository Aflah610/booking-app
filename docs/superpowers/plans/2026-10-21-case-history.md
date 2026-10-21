# Case history release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intake assessment and session notes per client, with access limited to the current therapist and clinical admins.

**Architecture:** New `case-history` slice (`case-history.dto.ts`, `.schemas.ts`, `.repository.ts`, `.service.ts`, `icd11.ts`) wired in `container.ts`; pages under `src/app/admin/case-histories`; server actions in `src/app/admin/case-histories/actions.ts`.

**Tech Stack:** Next.js server components and actions, Drizzle + Postgres, Zod, Vitest on real Postgres.

**Spec:** `docs/superpowers/specs/2026-10-21-case-history-design.md`

## Global Constraints

- Only repositories import Drizzle; services throw `DomainError` (`not_found`, `invalid`, `conflict`, `forbidden`).
- Clinical text never goes into `audit_log` details, logs or URLs.
- Choice lists exactly as the spec's Data section; overall risk = highest of the three ratings.
- Access: current therapist or `clinical_admin`; checked in the service and in every page and action.

## Review Focus

- A therapist reassigned away opens an old link → `forbidden`, not the record. Test in Task 2.
- Two notes saved at once for one case → numbers 1 and 2, no duplicate. Test in Task 2 (parallel `Promise.all`).
- A booking of another client chosen for a note → `invalid`. Test in Task 2.
- Editing a signed note through a crafted form post → `conflict`. Test in Task 2.
- A restricted reader on the list never receives diagnosis text in the page HTML. Checked in Task 3 by rendering as a manager.

---

### Task 1: Schema, ICD-11 list, migration

**Files:** `src/db/schema.ts`, `drizzle/0025_case_history.sql` (generated), `src/features/case-history/icd11.ts`, `tests/helpers.ts`.
**Produces:** tables `case_history`, `session_note`, `session_note_addendum`; `staff.clinicalAdmin`; `ICD11: { code: string; title: string }[]`, `icd11Title(code): string | null`.
- [ ] Schema + check constraints for every choice column; unique `case_history.client_id`, `session_note.booking_id`, `(case_history_id, number)`.
- [ ] `npm run db:generate -- --name case_history`; tests reset truncates the new tables.

### Task 2: Service and repository

**Files:** `src/features/case-history/*`, `src/features/container.ts`, `src/features/staff/*` (clinicalAdmin in DTO and update), `tests/case-history.test.ts`.
**Produces:** `caseHistory.forReader(reader: StaffDTO, clientId): Promise<CaseRecordDTO>` (creates on first open), `saveIntake(reader, clientId, step: 1..6, input)`, `completeIntake(reader, clientId)`, `addNote(reader, clientId, input) : Promise<SessionNoteDTO>`, `updateDraft(reader, noteId, input)`, `deleteDraft(reader, noteId)`, `signNote(reader, noteId)`, `addAddendum(reader, noteId, text)`, `list(reader, filters): Promise<CaseListRow[]>` (diagnosis null where restricted), `canRead(reader, clientId): Promise<boolean>`, `bookingsWithoutNote(reader, clientId)`.
- [ ] Tests for rules 1–8 of the spec and the Review Focus items.

### Task 3: List and case pages, notes

**Files:** `src/app/admin/case-histories/page.tsx`, `[clientId]/page.tsx`, `actions.ts`, `src/components/Shell.tsx` (menu item).
- [ ] List per spec screen 1 with query-param filters; case page per screen 2 with the note form (screen 4) and addendum form.
- [ ] lint, typecheck, test; check in `npm run dev` on the test database.

### Task 4: Intake steps, clinical admin toggle, client tab

**Files:** `[clientId]/intake/page.tsx`, `src/app/admin/staff/[id]/page.tsx` + its action, `src/app/admin/clients/[id]/page.tsx`.
- [ ] Six steps per spec screen 3, each a form posting `saveIntake` and moving to the next step; step 6 also offers **Mark intake complete**.
- [ ] Staff page: "Clinical admin" toggle (admins only). Client page: overview per screen 5.
- [ ] lint, typecheck, test; dev check; deploy (RUNMIGRATIONS is on), verify health and the Neon migration count (26).
