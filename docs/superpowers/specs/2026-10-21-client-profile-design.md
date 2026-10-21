# Client profile redesign

Status: draft for review · 2026-10-21 · Prototype: https://claude.ai/artifact/MLcPax9DqnHbE2Emw33yrU

## Goal

Opening a client should show, at a glance, who they are, who is treating them and what is happening with them, without
the clutter of the current page (credits forms, booking list and an edit form all visible at once).

Success: staff find the client's ID, phone, key details and current therapist without scrolling or clicking; everything
else (case history, bookings, credits) is one click away; nothing the current page can do is lost.

## Layout

Two columns on desktop; on a phone the right column moves below the left.

**Left, about two thirds: activity, one tab at a time** (`?tab=case|bookings|credits`, default `case`)

- Header: name, status badge, "Client since <created date> · next session <first upcoming booking>", **New booking**.
  The badge is worked out from bookings until the case history module records it: **Not started** (no completed
  session), **In therapy** (an upcoming booking, or a completed one within the Concluded grace period the therapist
  report uses), otherwise **Concluded**.
- **Case history** tab: an overview card and **View case history →**. The case history module is not built yet, so until it
  is this tab shows an empty state ("No case history yet") and the link is hidden. The overview fields (diagnosis, risk,
  approach, progress, last note) arrive with that module.
- **Bookings** tab: sub-tabs **Upcoming · Past · Cancelled** with counts (`?bookings=upcoming|past|cancelled`).
  Upcoming = status `upcoming`; Past = `completed` and `no_show`, newest first; Cancelled = `cancelled`. One row per booking:
  reference, date and time, service, clinician, one badge.
- **Credits** tab: the current credits section unchanged (wallet, package credits, Sell a package, Add wallet money, the
  rules sentence, Recent use, used-up packages).

**Right, about one third: general info**

- Two small boxes on top: **Client ID** (`CL-00142`) and **Phone**.
- **General info**: five key rows (age and gender, occupation, location, email, emergency contact), then **Show all
  details** reveals the rest (date of birth, marital status, education, languages, WhatsApp updates, registered on and by,
  how they found us, consent, notes). **Edit** opens a full edit form.
- **Assigned therapist**: name, designation, "since" date, **Reassign**. Under it, **Previously**: each earlier therapist,
  newest first, with dates, sessions held with them, who reassigned and why, and "former staff" when they have left.

Follows `globals.css`: white and black, red and green only for outcomes (Done, Paid, Cancelled, No-show), `.card`,
`.tabs`, `.badge`, 14 px body, 11–12 px uppercase grey labels.

## Data

All new client fields live in `client` (client personal data stays in that one table). All are optional.

| Column | Type | Notes |
|---|---|---|
| `number` | integer, identity, unique | Shown as `CL-` + 5 digits. Existing clients are numbered by `created_at`. |
| `date_of_birth` | date | Age is computed, never stored. |
| `gender` | text | Female, Male, Non-binary, Prefer not to say, or free text. |
| `marital_status` | text | Single, Married, Divorced, Widowed, Separated, Other. |
| `occupation`, `education`, `location`, `languages` | text | Free text. |
| `emergency_name`, `emergency_relation`, `emergency_phone` | text | Phone stored as E.164 like `phone_e164`. |
| `referral_source` | text | "How they found us". |
| `consent_signed_at` | timestamptz | Null = not recorded. |
| `registered_by` | uuid → staff, null | Set when staff create the client; null for website bookings. |

New table **`client_therapist`**: one row per period a therapist was assigned.

| Column | Notes |
|---|---|
| `id`, `client_id` → client (cascade), `staff_id` → staff | |
| `starts_at`, `ends_at` (null = current) | timestamptz, UTC |
| `assigned_by` → staff, `reason` text | Who made the change and why |

A partial unique index allows only one open row (`ends_at is null`) per client. "Sessions with them" is counted from
bookings with that staff member between `starts_at` and `ends_at`, not stored.

## Rules (in `clients.service.ts`, each with a test)

1. Editing general info validates every field with Zod; a date of birth in the future or before 1900 is `invalid`.
2. Assigning a therapist closes the open row at the same moment it opens the new one, in one transaction with its
   `audit_log` row.
3. The therapist must be active staff; otherwise `invalid` ("Staff member 123 is not active").
4. Assigning the therapist who is already assigned is a `conflict`.
5. Replacing a therapist requires a reason; the first assignment does not.
6. A therapist who later leaves keeps their history rows; the page labels them "former staff".

## Access

Unchanged: the page needs `manager` or above, as today. Clinical permissions (who may read case notes) are decided with the
case history module.

## Out of scope

The case history module itself; the clients list page (it may show the client ID later); clinical permissions; the
website API (no new fields in public responses).

## Delivery

Two pull requests, each within the size rule:

1. **Data and rules**: schema, migration (`client_profile_fields`), repository, service, tests.
2. **Page**: the redesigned client page, the edit form and the reassign form.

Then deploy to Catalyst Development (the container applies the migration on start), check the page, and only then
Production.
