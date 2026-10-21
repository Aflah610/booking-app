# Case history, release 1: intake and session notes

Status: agreed in chat 2026-10-21 · Prototype (list, option A): https://claude.ai/artifact/N3fXCsaiYmz5nnWrcQ9dUa

## Goal

Each client has one clinical record: an intake assessment (complaints, history, mental status, risk, diagnosis, plan)
and a timeline of session notes, each stamped with when and by whom. Release 2 adds scales, termination and the
final report.

## Who sees what

- **Reads and writes the clinical record**: the client's current therapist (`client_therapist` open period) and staff
  marked **clinical admin** (a new `staff.clinical_admin` flag, set by admins on the staff page). A therapist who is
  reassigned away loses access; the new one sees the whole record.
- **Everyone else** with access to the list (managers and admins) sees the client, status, risk and therapist, never
  diagnosis or notes. Therapists without clinical admin see only their own clients in the list.
- Every open of a record by someone other than its author is not logged in release 1 (noted for release 2).

## Screens

1. **Case histories** (`/admin/case-histories`), menu item for all staff: the option A table. Status chips
   (All, Intake pending, In treatment, High risk) with counts, search (name, client ID, phone), therapist filter
   (All, Unassigned, each active, each former) and risk filter, all as query params. Columns: client and ID, status,
   primary diagnosis and ICD-11 code (or "Restricted"), risk, therapist with avatar and Former badge, session count and
   last note (date and author), Open.
2. **Case** (`/admin/case-histories/[clientId]`), full page:
   - Header: name, client ID, status, therapist, **Edit intake**, **Add session note**.
   - **Initial assessment** summary: presenting complaints with onset, duration and severity; diagnosis; mental status
     (appearance, behaviour and cooperation, rapport, mood and affect, thought, perception, cognition, insight,
     judgement); risk matrix (suicide, self-harm, harm to others); plan (goals, approach, frequency). Empty sections say
     "Not recorded".
   - **Sessions**, newest first: session number, date of the session, risk, response to the session, progress since
     last time, summary, next plan, homework, follow-up date; footer "Written by <avatar> <name> · <timestamp>";
     Draft or Signed; addenda listed under the note with their own author and timestamp.
3. **Intake** (`/admin/case-histories/[clientId]/intake?step=1..6`): six steps, each saved on its own:
   1 Presenting problem, 2 History (past psychiatric, medical, medication, family), 3 Personal history (life history,
   substance use, premorbid personality), 4 Mental status, 5 Risk and diagnosis, 6 Plan, then **Mark intake complete**.
4. **Session note** form on the case page: pick the booking (the client's past bookings without a note, newest first;
   or "No booking" with a date), fill the fields, **Save draft** or **Sign**.
5. **Client page** Case history tab: the overview from the record (status, diagnosis, risk, approach, notes count, last
   note line) and **View case history**, or the empty state; restricted readers see status and risk only.

## Data (option A: real tables)

- `staff.clinical_admin boolean not null default false`.
- `case_history`: one per client (`client_id` unique). `status` enum `intake_pending | in_treatment | concluded`
  (release 1 sets the first two). Free text: `presenting_complaints`, `duration`, `history_present`, `past_psychiatric`,
  `medical_history`, `medication`, `family_history`, `personal_history`, `substance_use`, `premorbid_personality`,
  `mse_appearance`, `mse_speech`, `mse_mood`, `mse_thought`, `mse_perception`, `mse_cognition`, `formulation`,
  `diagnosis_secondary`, `diagnosis_specifiers`, `goals_short`, `goals_long`, `approach`, `frequency`, `plan_notes`.
  Fixed choices (text with check constraints): `onset` (sudden, gradual, unknown), `severity` (mild, moderate, severe),
  `mse_cooperation` (cooperative, partially, uncooperative), `mse_rapport` (good, fair, poor), `mse_affect` (euthymic,
  anxious, depressed, irritable, elevated, blunted, labile), `mse_insight` (good, partial, poor, absent),
  `mse_judgement` (good, fair, poor), `risk_suicide`, `risk_self_harm`, `risk_others` (none, low, moderate, high).
  `diagnosis_code` + `diagnosis_label` from the ICD-11 list (or a label alone for "Other"). `intake_completed_at`,
  `intake_completed_by`, `updated_by`, timestamps. Overall risk = the highest of the three.
- `session_note`: `case_history_id`, `booking_id` (unique, nullable), `number` (unique per case, next in sequence),
  `session_at` timestamptz, `author_id`, `summary` (required), `risk` (none..high), `response` (engaged, partially
  engaged, resistant), `progress` (improved, same, worse), `next_plan`, `homework`, `follow_up_on` date, `signed_at`,
  timestamps.
- `session_note_addendum`: `note_id`, `author_id`, `text`, `created_at`.

## Rules (service, each tested)

1. Only the current therapist or a clinical admin may read or write a record; others get `forbidden`.
2. The record is created on first open by an allowed reader (status `intake_pending`).
3. Fixed-choice fields reject values outside their list (`invalid`); `diagnosis_code` must be on the ICD-11 list.
4. Marking the intake complete needs presenting complaints and at least one risk rating; it sets status `in_treatment`.
5. A note's number is the next for that case, even when two are saved at once (unique constraint, retry).
6. A booking gets at most one note and must belong to the same client.
7. A draft can be edited or deleted only by its author; a signed note can't be edited or deleted, only given an
   addendum (by any allowed reader).
8. Every write commits with its `audit_log` row; details name fields, never clinical text.

## ICD-11 list

A fixed list in code of the common Chapter 6 (mental, behavioural or neurodevelopmental) codes and titles, with
"Other" for anything else. Source: WHO ICD-11 MMS, CC BY-ND 3.0 IGO; codes and titles unchanged.

## Out of scope (release 2)

Scales and progress charts, termination and outcome, the final report and its download, view logging, clinic export.

## Delivery

Three pull requests: (1) data, rules and tests; (2) list and case pages with session notes; (3) intake steps, staff
clinical-admin toggle and the client page tab. Deploy to Catalyst after each passes lint, typecheck and tests.
