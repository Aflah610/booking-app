# Work log (shared by Codex and Claude Code)

Newest first. One entry per finished piece of work: date, agent, what changed, what is live, what is open.
The website has its own log in the `mindlap-therapy` repo (`docs/WORKLOG.md`).

## 2026-10-25 · Codex · CCD billing attempt blocked by Meta signup

- Aflah confirmed CCD phone ends 91552. Meta portfolio phone-number search found no matching account.
  No CCD billing account has been identified; no payment method saved, funds added or charges authorised.
- Aflah completed the Facebook login step, but its popup closed without a completed phone connection. Booking settings
  still showed unconnected and the button waited for Meta until reload. Actual phone onboarding remains unverified;
  the earlier live verification covered the settings UI and CI, not a completed Meta signup or message delivery.
- Existing config 1096432136351868 expands as WhatsApp Embedded Signup, system-user token, 60 days, WhatsApp assets and
  the two WhatsApp management/messaging permissions. The current new-config wizard offered only General login.
  Cancelled an unsaved draft named Mindlap WhatsApp v4. No new config created and no existing config saved/changed.
- Meta official v4 docs say v2/v3 retired 15 Oct 2026 and a new config with selected products is required. This is a
  compatibility lead, not proof of the exact failure. Tech Provider onboarding page failed to render, including after
  reload (Meta async error 1007); eligibility could not be verified. Template list only exposed measurement v2 and
  the existing-style 60-day WhatsApp signup template. Do not create another copy and assume it fixes onboarding.
- Next: resolve Meta signup configuration/eligibility and add a recoverable state for code-without-FINISH, then link
  CCD phone with Aflah before assigning billing. Keep OTP settings and Zoho 774 unchanged.
- Sources: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
  and https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

## 2026-10-25 · Codex · CCD WhatsApp continuation

- Took over Claude's interrupted ccd-number branch at Aflah's request. Separate leads and CCD connection cards,
  migration 0037 and CCD workflow sender routing; existing OTP settings unchanged. Connected CCD sender takes priority
  over the legacy environment number. CCD/OTP replies cannot create leads when sales is not connected.
- Fixed shared Meta SDK loading and signup event handling for two cards; reject a duplicate number before Meta calls,
  with a database constraint as a concurrency backstop. Added real-database signed webhook and sender regression tests.
- Validation: both PR and main CI passed lint, typecheck, 446 tests across 42 files, production build, Docker build
  and production dependency audit. Local Turbopack is blocked by the existing node_modules junction; webpack compiles
  but hits pre-existing generated route type errors. CI is the release validation (disposable Postgres).
- LIVE: c48457f published and verified in the signed-in browser: both connection cards/buttons present and enabled,
  both still unconnected. Migration applied by deployment. No real messages sent or workflows enabled. See docs/whatsapp-ccd-handover.md
  for template drafts and activation: Meta billing, CCD phone signup, permanent sending token and template approval.
- Still open: coordinated Meta app-secret rotation, 774/Zoho cutover with Aflah, staff Calendar connections,
  MCH real import (approval pending), and the security-review findings. Do not import clinical data before S1-S3 fixes.

## 2026-10-25 · Claude Code · Meta app live, webhook verified

- Meta app "Mindlap Messaging" (1528505165963496) published (live). App domain mindlap.in, privacy/terms/data
  deletion = mindlap.in/privacy and /terms, category Business and pages.
- Webhook https://book.mindlap.in/api/whatsapp/webhook verified; subscribed fields: messages, smb_message_echoes.
  Server env now has WHATSAPP_APP_SECRET and WHATSAPP_WEBHOOK_VERIFY_TOKEN (app recreated, health ok).
- Open: Meta billing (Aflah), app secret reset later (it was shared in chat), then the 774 switch night.

## 2026-10-25 · Claude Code · Settings > WhatsApp (Coexistence connect) live

- New page Settings > WhatsApp: "Connect WhatsApp Business app" runs Meta embedded sign-up (featureType
  whatsapp_business_app_onboarding), swaps the code, subscribes our app to the WABA and stores waba/phone number id
  in business (migration 0036). Webhook takes leads from that number (env WHATSAPP_LEADS_PHONE_NUMBER_ID still wins).
- Server env: META_APP_ID=1528505165963496, META_ES_CONFIG_ID=1096432136351868 set (app not restarted for it yet,
  the deploy recreated the container). Still missing: WHATSAPP_APP_SECRET (Mindlap Messaging app secret) and
  WHATSAPP_WEBHOOK_VERIFY_TOKEN, plus the webhook URL https://book.mindlap.in/api/whatsapp/webhook subscribed to
  "messages" in the Meta app. Then the switch night: Zoho deactivate, register 774 in WhatsApp Business app, connect.

## 2026-10-25 · Claude Code · leads: filters, closed deals, sales summary

- Leads page: tabs Open / Follow up today / Closed deals / Lost / All; filters for status, source, BDE and the day
  a lead came in (or closed). Managers see a sales summary per BDE (today / 7 / 30 days: new, contacted,
  converted, conversion %, deal total).
- A lost lead needs a reason; when that person writes again the same lead reopens (no second lead), kept by the
  same BDE if they are still online. Converting by a booking fills in the deal (package price, else session
  price, and what was bought); staff can record a phone/cash deal with an amount. Migration 0035_lead_deals.
- Meta prep for moving +91 75940 00774 off Zoho (Coexistence): system user mindlap-website has 774's WABA
  (27997481349919392); app "Mindlap Messaging" (1528505165963496, was "final testy", OTP uses it) has an
  Embedded Signup configuration 1096432136351868 and allows book.mindlap.in. Open: the Connect WhatsApp button
  in Settings, permanent token, Meta billing, then the switch night with Aflah. Do NOT deactivate Zoho before.

## 2026-10-25 · Claude Code · staff on @mindlap.in, Google sign-in on

- Live data: staff Ansha (psychologist, both services, Theresa's hours), Avanthika + Akhila (ccd), Nihla (bde),
  Liba (manager) added with @mindlap.in emails. Existing staff were already on @mindlap.in. Shefin (marketing)
  and Jasim (accounts) deliberately NOT staff in the booking app.
- Server: AUTH_GOOGLE_ID/SECRET = same OAuth client as Calendar (redirect /api/auth/callback/google), so
  "Sign in with Google" shows on /login. Health ok.
- Open: Christine and Jasmin are access_role manager though Aflah lists them as psychologist/therapist; Ansha is
  not mapped on the website's online-therapist list (worker/book.js ONLINE_THERAPISTS).

## 2026-10-25 · Claude Code · Google Calendar + Meet switched on

- Google Cloud project `mindlap-booking` (owner admin@mindlap.in): Calendar API on, consent screen Internal
  (only @mindlap.in accounts), OAuth web client "Mindlap booking app" with redirects
  `/api/calendar/google/callback` and `/api/auth/callback/google` on book.mindlap.in.
- Server `/opt/mindlap/app.env`: GOOGLE_CALENDAR_CLIENT_ID/SECRET and CALENDAR_ENCRYPTION_KEY added (backup
  `app.env.bak-*`), app recreated, health ok. AUTH_GOOGLE_* (Google sign-in) NOT set.
- Live data: business.meet_enabled = true; both services meeting_type = google_meet.
- Open: each psychologist connects Google Calendar (Staff > their page > Connect) with their @mindlap.in account.
  Staff login emails are still the old Gmail addresses (not changed). MCH dry run done (283 clients / 198 case
  histories / 394 notes would copy, 20 clients held back for shared/invalid phones); real copy waits for Aflah.
  Neon and Catalyst deleted. Workspace: 16 users, support@mindlap.in group with send-as.

## 2026-10-25 · Codex · cross-project security review

- Added `docs/SECURITY-REVIEW-2026-10-25.md` in both projects. Three high-priority
  findings: manager can edit an existing admin login email, booking mutations
  bypass booking permission, and Worker capture failures still confirm paid status.
- Four medium findings cover clinical permission revocation, contact lookup,
  workflow internal destinations and missing booking-app browser security headers.
- Six offline synthetic probes confirmed the paths; script is in the website repo
  at `tools/security/review-checks.cjs`. No production data or real payments touched.
- Live sampled private routes denied unauthenticated access; production npm audit
  reported no known advisories, full audit found four moderate affected dev packages
  in one esbuild chain. AWS/network/backups and legacy services need separate verification.
- All findings open. No live behaviour changed. Prioritise S1-S3 before further import.

## 2026-10-25 · Codex · shared system overview

- Added `docs/OVERVIEW.md` with Aflah's ecosystem summary, completed work, pending
  migrations, owner decisions and handover guidance; linked it from `AGENTS.md`.
- Identical overview saved in the website repo. Documentation only; live behaviour unchanged.
- Open: MCH export, dry run and Aflah's count review remain next. No migration run.

## 2026-10-25 · Claude Code · state at handover

Live (main `1d37586`):
- Case history in MCH's six steps and fields, Severe risk level, MCH session note fields, MCH client code.
- Reassigning a client's psychologist moves their open follow-up thread too.
- "Most sessions per psychologist per day" setting (set to 7), counted across services.
- Couple therapy 90 min; 30-minute gap after both services; couple packages 4/8/12.

Open:
- **MCH data import:** code ready (`scripts/import-mch.ts`, `deploy/mch/export.sql`). Next: export from the
  MCH server, dry run, show Aflah the counts, then `--commit` with `--create-missing-staff`. MCH has 303
  clients, 207 case histories, 411 session notes, 13 psychologists. Match by phone and staff name.
- Upcoming bookings stay with the old psychologist on reassignment (Aflah may want them moved).
- WhatsApp OTP via Meta (needs billing and a permanent token), Callyzer purchase on hold, Zoho CRM shutdown.
