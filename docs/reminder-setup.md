# Live WhatsApp reminders - 27 October 2026

## Current state

- Sender: MindLap, number ending 00282, phone ID 1427401513782694, WABA 1421949459564180.
- Meta reports GREEN quality. Both Utility templates are APPROVED, English en, POSITIONAL, five body values.
- The existing OTP system-user token was verified valid, with expires_at=0 and data_access_expires_at=0 and
  WhatsApp management/messaging permissions. It belongs to the existing OTP app 2130581677532743.
  It was reused; no new token or permissions were created. Do not revoke it casually: existing OTP uses it too.
- WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are set in /opt/mindlap/app.env. No credential values
  belong in this repo. Other settings, including AUTH_SECRET and the paused OTP migration, were preserved.
- Root-only rollback backup: /opt/mindlap/backups/app.env.before-reminders-20261027T120823Z.
- App container recreated and public health returned ok. All three workflows verified active after Aflah's test receipt.

| Workflow | Offset before start | Meta template | Body values in order |
| --- | --- | --- | --- |
| WhatsApp reminder 24 hours before | 1440 minutes | session_reminder_day | client_name, staff, date, time, booking_id |
| WhatsApp reminder 3 hours before (join link) | 180 minutes | session_reminder_join | client_name, staff, time, meeting_link, booking_id |
| WhatsApp reminder 30 minutes before (join link) | 30 minutes | session_reminder_join | client_name, staff, time, meeting_link, booking_id |

All three apply to all services. Both current services are online. The engine skips reminder times already past when
booking is confirmed, respects WhatsApp opt-in, and cancels queued reminders when a booking is cancelled/rescheduled.
No eligible consented future bookings existed at activation, so no historical reminders were replayed or backfilled.
New confirmations use the normal app scheduler. No extra bookings or payments were created by this setup.

## Delivery validation

One session_reminder_day test used Aflah's existing BK-00006 (26 October with Jasmin). The driver ran the actual
application workflow renderer and Meta sender inside the configured app container with a single in-memory test run.
The workflows stayed disabled during that test; no test workflow_run was inserted and no other customer was messaged.
Meta accepted it and Aflah explicitly confirmed Received correctly - enable reminders. All three rendering previews
passed, including non-empty signed join URLs, before activation through the application's audited workflow service.
No additional live test message was sent. Temporary sender token files, payload, restricted SSH copy and helper bundles
were removed; server environment and the protected rollback backup remain.

## Still needed for real video calls

The meeting_link variable is the booking app's stable signed /join link, not the raw Google Meet address. It is non-empty
for online bookings even before Google Calendar is connected. Missing Calendar therefore does not itself make this
Meta template invalid. However, without an actual meeting URL the join page waits for a link and cannot open a call.
At setup, zero of seven bookable therapists had a Google connection ready to push bookings/create Meet links.
Each therapist must connect their own Google Calendar, or an authorised staff member must add the actual meeting link.
Do not claim automatic Meet creation is ready until that separate step is verified. Do not invent links or sign in as staff.

## Access changes made for setup

The correct Lightsail account is mindlap_booking_aws. Its running mindlap-app server was present in Mumbai, but the
console-visible regions excluded Mumbai. Added Mumbai while retaining the original three visible regions.
The SSH rule had an older single-address restriction. Added this machine's current IPv4 as another /32, preserving the
old source and leaving HTTP/HTTPS and browser SSH settings unchanged. SSH then worked. Its original scratchpad key
had permissive local ACLs, so only a temporary owner-restricted copy was used; the original file was not modified.

CCD account remains untouched. OTP migration is still paused. Temporary one-rupee booking prices remain as previously
requested until Aflah finishes the separate booking tests; restoration values are in WORKLOG.md.
