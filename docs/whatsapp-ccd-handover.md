# CCD WhatsApp handover

25 October 2026. Continuation of Claude's interrupted `ccd-number` work.

## Agreed number split

- Sales number ending 774: ad enquiries and BDE chats; only this number creates leads.
- CCD number: confirmations, reminders with a join link and follow-ups; CCD answers on the phone's WhatsApp Business app.
- Existing OTP number ending 00282: separate OTP settings, unchanged by the CCD connection.

Settings > WhatsApp now has separate connection cards. Connecting a card records the Meta account and phone-number IDs;
it does not enable a workflow or prove that sending is ready. The connected CCD number takes priority over the legacy
WHATSAPP_PHONE_NUMBER_ID setting. WHATSAPP_ACCESS_TOKEN remains a server-only sending token and must have access to the
CCD number's account. The temporary embedded-signup token is used only for the connection, never saved as a sending token.

## Activation still needed

1. Aflah completes Meta billing for the CCD WhatsApp account.
2. Aflah connects the CCD phone through the messages card and completes Meta sign-in and the phone QR step.
3. Configure a permanent system-user sending token on the server without pasting it into chat or the repository.
4. Submit and obtain approval for the templates below in the CCD account; confirm their exact language codes.
5. Create the corresponding WhatsApp workflows in Settings > Workflows. Keep them inactive until an opted-in test
   recipient has received one approved test message from the CCD number. Check the join link and the reply on the phone.
6. Only then enable the required workflows. No live workflows or real-client messages were created by this code change.

The 774 transfer from Zoho is a separate cutover with Aflah present. Keep Zoho receiving leads until that cutover.
Reset the Meta app secret previously shared in chat, update the matching server setting and verify webhook signatures
as one coordinated change. Each psychologist must connect their own Google Calendar before relying on generated Meet links.

## Proposed templates for Meta review

Use these new names to avoid changing parameter counts on existing templates. Proposed category: Utility; language: English.
Meta determines approval/category. Use synthetic sample names and links when submitting.

### booking_confirmation_join

Hi {{1}}, your Mindlap session with {{2}} is confirmed for {{3}} at {{4}}. Join your session here: {{5}}. Booking ID: {{6}}.
Reply here if you need help changing your booking.

Workflow trigger: booked. Parameters, in this exact order:
`{{client_name}}`, `{{staff}}`, `{{date}}`, `{{time}}`, `{{meeting_link}}`, `{{booking_id}}`.

### booking_reminder_join

Hi {{1}}, your Mindlap session with {{2}} is on {{3}} at {{4}}. Join your session here: {{5}}. Booking ID: {{6}}.
Reply here if you need help.

Workflow trigger: appointment_start, before, 60 minutes. Same six parameters as confirmation.
Use these join templates only for online services. Select those services in the workflow.

### follow_up_suggestion

Draft prepared in Meta: Hi {{1}}, {{2}} suggests your next Mindlap session around {{3}}. Reply to this message to arrange a time that suits you.

Parameters: client name, psychologist name, suggested date. The therapist's follow-up action already uses this template name.
This is a therapist-requested suggestion, not an automatic 24-hour rule. Delayed follow-ups need their own configured workflow.

## Checks

Migration 0037 adds CCD fields and prevents one phone-number ID being used in both cards. Existing sales settings remain.
Signed webhook tests cover CCD-only setup and mixed sales/CCD/OTP batches. Sender tests cover CCD precedence, legacy fallback,
missing setup and Meta rejection. No production database or real messages are used by these tests.
