# Work log (shared by Codex and Claude Code)

Newest first. One entry per finished piece of work: date, agent, what changed, what is live, what is open.
The website has its own log in the `mindlap-therapy` repo (`docs/WORKLOG.md`).

## 2026-10-26 · Claude Code · case histories list only people in treatment

- Case histories used to list every client row (anyone who started a website booking, messaged sales or was added),
  each shown as "Intake pending". Now it lists a client only with a current psychologist, session notes, a started
  intake/diagnosis, or a non-cancelled booking that is paid, free, or made by staff (no online payment window).
  Unpaid website attempts and leads stay in Clients/Leads. Test added. The 4 test clients on live are untouched.
- NOT live: main CI fails since Codex's 86e5fea (S4/S5), so the server deploys nothing new. The two failures are in
  Codex's area, not this change: tests/case-history.test.ts "hides diagnosis..." now gets forbidden for list(manager)
  (old expectation []), and the revoke test's sendFollowUp call fails Zod (email boolean missing) instead of forbidden.
  Left for Codex (one agent per task). Once main is green, this change deploys with it.

## 2026-10-26 · Codex · S4/S5 clinical and contact permission fixes prepared

- S4: case-history reads now require current clinical permission plus assignment, unless explicitly granted
  read-all/clinical-admin access. Read-all alone cannot edit intake, notes, signatures, addenda or send follow-ups.
  Write controls and intake URLs enforce the same write policy. Clinical admins retain their explicit authority.
- S5: contact-based client search requires both clients.view and clients.contact. Denies the entire lookup without
  either permission, including searches by phone/email, so hidden contacts cannot be inferred through matching.
- Added service and real-action/session regression coverage. Test migration launcher now uses Node directly on
  Windows/Linux. Local database integration run blocked because test Postgres is unavailable; CI is required.
- Not live yet: draft PR validation pending. S6/S7 being prepared separately. No production client data accessed.

## 2026-10-25 · Claude Code · security S1-S3 fixed

- S1: only an admin can change an admin's record (email, active, role, services, password); enforced in
  StaffService (assertMayEdit) and the staff action. Managers still edit ordinary staff.
- S2: reschedule, cancel, payment status, pay-with-credit and record payment need "bookings.create" (CCD/admin by
  default) as well as seeing the booking; the booking page hides those controls otherwise. Psychologists keep
  attendance, notes and meeting-link controls on their own sessions.
- S3 (website worker, mindlap-therapy repo): a payment counts as paid only once Razorpay shows it captured; a failed
  capture is re-checked, otherwise stays pending and the webhook answers 503 so Razorpay retries.
- Tests: tests/security-actions.test.ts (S1, S2 through the real server actions); S3 offline checks 5/5.
  S4-S7 remain open.

## 2026-10-25 · Claude Code · CCD: Meta follow-up drafted, App Review pack, stuck-button fix

- Took over from Codex. Meta support case 28735961256069110 (Open; chat handed to a human specialist): Meta says CCD
  ending 91552 is eligible for Coexistence but blocked by (a) Marketing Messages enrolment on the phone number and
  (b) app Unapproved for WhatsApp, lacking Advanced Access to whatsapp_business_management and
  whatsapp_business_messaging. Meta suggested deleting and re-registering the WhatsApp account: NOT done, NOT
  recommended without Aflah's explicit decision (loses history, groups, backups).
- Follow-up comment asking for a non-destructive unenrolment route, the exact effects of deletion, and confirmation
  that App Review is the right route: typed into the case's comment box, NOT submitted (awaiting Aflah's approval).
- docs/meta-app-review.md: use-case text and screen-recording script for both permissions. Both show "Ready for
  testing" with recorded calls. Not submitted; the messaging recording needs a working CCD send or the OTP fallback.
- ConnectWhatsApp button: after Meta returns a code without the number IDs, it stops waiting after 20 s and explains
  instead of spinning forever. No server access used (the earlier SSH key use remains unapproved). No message sent.

## 2026-10-25 · Codex · CCD activation investigation and Meta support draft

- CCD is labelled WhatsApp Business app in Business Settings and remains Offline in WhatsApp Manager.
  Business Support Home lists four other platform messaging accounts without issues; CCD is absent.
  This is evidence of an onboarding gap, not proof of a policy ban or an App Review root cause.
- App Quickstart shows business verification completed and Tech Provider App Review incomplete. The provider
  enrolment flow requires Tech Provider Terms and describes messaging for client businesses. Did not accept
  those terms or enrol Mindlap as a provider for its own internal integration.
- Opened Meta Direct Support via app Resources > Review open support tickets. Prepared Dev: Onboarding /
  Onboarding Status Pending case asking for the exact template restriction reason and supported self-owned
  Coexistence activation route. Draft is filled, NOT submitted; await explicit approval to contact Meta.
- Billing remains funded; no token, server setting, template approval or test delivery completed. No app code
  changed. Preserve the support form while awaiting approval. Private review copy is outside the repository.

## 2026-10-25 · Codex · Meta refuses CCD template management; phone Offline

- Aflah supplied Meta's explicit error: WABA not allowed to manage templates; this WABA is not allowed to create
  or update templates. An enabled editor/Submit button was not proof of account eligibility. No approved CCD template
  or successful submission has been established. Do not retry unchanged template content to fix this account-level error.
- Read-only check in CCD WhatsApp Manager > Phone numbers shows ending 91552 as Offline. Settings exposes only Profile;
  profile editing controls are disabled. Phone number ID was read directly from that UI: 776524275555070.
  Account/asset ID remains 1584174005895546. These are distinct IDs; neither was written to booking settings.
- This differs from Business settings' prior Connected phone/portfolio link and funded billing. Combined with absence from
  app API Setup sender list, it supports incomplete API activation as a lead. It does not prove Meta's exact restriction
  reason or a policy violation. Next: complete/diagnose Coexistence Cloud API onboarding and account permissions, then
  resubmit templates only once Meta permits it. No test message sent, token created or server credential used.
- Explicit approval for the specific server-key use is still pending. User's error screenshot is not such approval.

## 2026-10-25 · Codex · CCD template drafts ready; API and server access still pending

- In the CCD account 1584174005895546, prepared three English Utility forms with synthetic samples:
  booking_confirmation_join, booking_reminder_join, follow_up_suggestion. All Submit for Review buttons enabled.
  These are unsaved browser drafts, NOT submitted or approved. Leave the marked browser tabs open for review.
- Confirmation and reminder use six ordered parameters: client, psychologist, date, time, join link, booking reference.
  Follow-up uses three: client, psychologist, suggested date; draft body recorded in docs/whatsapp-ccd-handover.md.
  No clinical text or real customer data used as review samples. Aflah supplied a consenting test recipient in chat;
  no message sent and no automatic workflow enabled.
- Meta app API Setup From selector currently lists 774, 955, OTP and test senders, but not CCD ending 91552.
  WhatsApp Manager exposes CCD template controls despite this. Portfolio linking/funding is not API readiness.
- Server SSH check was rejected by automatic approval review because the particular existing credential source was
  not explicitly authorised. No SSH connection occurred. Await Aflah's explicit approval before any retry.
- Next: obtain template-submission confirmation, submit and verify Meta status; resolve CCD Cloud API onboarding,
  obtain approved server access, configure the sending token securely, then send the agreed test once.

## 2026-10-25 · Codex · CCD prepaid billing funded and verified

- Aflah completed Meta's legal billing information and added funds himself after choosing UPI. Verified the billing page
  for consultation coordinator MindLap / CCD ending 91552 shows available prepaid funds and a payment marked Funded.
  Billing location is India, currency INR. No bank details, billing address, receipts or payment identifiers recorded here.
- CCD billing is now funded. Meta states messaging deducts from available funds and stops if the balance runs out.
- This is billing completion only: Cloud API connection to the booking app, sending-token setup, template approval and
  opted-in end-to-end delivery test remain open. No real-client messages or automatic workflows enabled by this work.

## 2026-10-25 · Codex · CCD number linked in Meta, billing form opened

- Aflah used Meta Business settings > WhatsApp accounts > Add > Link a WhatsApp Business account for CCD ending 91552.
  Verified its linked phone row shows Connected under consultation coordinator MindLap (selected Meta asset 1584174005895546).
  This resolves the prior missing-account blocker. It does not establish Cloud API onboarding or booking-app connectivity.
- Opened Payment settings for that exact account. No payment method and no spending. Continued the location setup with
  India, Indian Rupee, Kolkata. Aflah chose UPI; selected it and continued. Meta now requires legal business name/address
  and a business/tax declaration before payment setup. Left that form for Aflah to complete directly. No payment details entered,
  payment method saved, funds added or charges authorised. Meta says later payment-method changes require support.
- Booking app Settings > WhatsApp still shows messages number unconnected. Keep this separate from the Connected status
  of the phone's WhatsApp Business app in Meta. Do not put a Meta asset/account ID into a phone-number-ID field by guess.
- Next: Aflah completes legal billing details, then UPI setup directly in Meta; verify saved billing status, then resolve Cloud API
  signup/configuration, permanent sending token and approved templates before sending a test. Prior signup findings remain
  investigative leads; linking in Business settings worked without completing that embedded signup path.

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
