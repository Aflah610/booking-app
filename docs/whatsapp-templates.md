# WhatsApp message templates (submit to Meta now)

Business-initiated WhatsApp messages must use templates Meta has approved, and approval can take a day or
more, so submit these during phase 1. The app starts sending them in phase 3.

Submit them in **Meta Business Suite > WhatsApp Manager > Message templates > Create template**.

- Category: **Utility** for all five (they're about a booking the client made).
- Language: English (add others later as separate translations of the same template name).
- Variables are numbered `{{1}}`, `{{2}}`… Meta asks for a sample value for each one; the samples below work.
- Replace "Your Firm" with the firm's name.
- Keep the template names exactly as written: the code will look them up by name.

## 1. `booking_confirmation`

Body:

> Hi {{1}}, your {{2}} with {{3}} is confirmed for {{4}}. Booking ID: {{5}}. Reply or tap a button below if
> you need to change it. – Your Firm

Samples: `Ravi`, `Consultation`, `Asha`, `Tue 20 Oct, 9:00 AM`, `BK-00012`

Buttons (quick reply): `Confirm`, `Reschedule`

## 2. `booking_reminder`

Body:

> Reminder: {{1}}, your {{2}} with {{3}} is on {{4}}. Booking ID: {{5}}. – Your Firm

Samples: `Ravi`, `Consultation`, `Asha`, `Tue 20 Oct, 9:00 AM`, `BK-00012`

Buttons (quick reply): `I'll be there`, `Reschedule`

## 3. `booking_rescheduled`

Body:

> Hi {{1}}, your {{2}} has moved to {{3}} with {{4}}. Booking ID: {{5}}. – Your Firm

Samples: `Ravi`, `Consultation`, `Thu 22 Oct, 11:00 AM`, `Asha`, `BK-00012`

## 4. `booking_cancelled`

Body:

> Hi {{1}}, your {{2}} on {{3}} has been cancelled. Booking ID: {{4}}. To book again, visit {{5}}. – Your Firm

Samples: `Ravi`, `Consultation`, `Tue 20 Oct, 9:00 AM`, `BK-00012`, `yourfirm.com/book`

## 5. `booking_no_show`

Body:

> Hi {{1}}, we missed you at your {{2}} on {{3}}. Would you like to book another time? – Your Firm

Samples: `Ravi`, `Consultation`, `Tue 20 Oct, 9:00 AM`

Buttons (quick reply): `Book again`, `No thanks`

## After approval

Note the template names and language codes. In phase 3 we'll need these environment variables set in AppSail
(never in chat or code): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (a permanent system-user token),
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`.

## Follow-up suggestion: `follow_up_suggestion`

Sent when a therapist presses **Send follow-up** in a case history. It suggests a date; nothing is booked.

Category: **Utility**. Language: English (`en`).

Body:

> Hi {{1}}, {{2}} suggests your next session around {{3}}. Reply to this message or call us to fix a time that suits you. – Your Firm

Samples: `Ravi`, `Asha`, `Fri, 30 Oct (afternoon)`
