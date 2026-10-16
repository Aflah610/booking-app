# Workflows

Admin > Workflows. A workflow says: **when** something happens to a booking, **send** something.

| Part | Choices |
|------|---------|
| When | Booking is made, rescheduled, cancelled, marked completed, marked no-show, appointment starts, appointment ends |
| Timing | Straight away, or a set time after. For "appointment starts / ends" also a set time before |
| Services | All, or only the ticked ones |
| Action | Email (to the client or the booked staff member), WhatsApp template message, or a signed webhook to your own URL |

Message text can use `{{client_name}}`, `{{client_phone}}`, `{{service}}`, `{{staff}}`, `{{date}}`, `{{time}}`,
`{{booking_id}}`, `{{location}}`, `{{manage_link}}` (the client's page to reschedule or cancel), `{{firm_name}}` and `{{cancel_reason}}`. Unknown names are refused when saving.

## How it runs

- A booking change queues one `workflow_run` row per matching workflow. Moving or cancelling a booking cancels
  its unsent rows, so nobody gets a reminder for an old time.
- A worker inside the app (every 30 seconds) sends due rows: up to 3 tries, then "Failed". A workflow problem
  never fails a booking. `POST /api/internal/workflows/run` with `Authorization: Bearer $CRON_SECRET` does the
  same from an external scheduler.
- If a channel isn't configured the row is logged as "Not sent" with the text it would have had.
- Each workflow's page shows its recent messages.
- Only bookings made or changed after a workflow exists are affected.

## Settings

See `.env.example`: `SMTP_*` + `EMAIL_FROM` for email, `WHATSAPP_*` for WhatsApp (templates in
`whatsapp-templates.md`), `WORKFLOW_WEBHOOK_SECRET` to sign webhooks.

## Webhook payload

```json
{ "event": "booked", "workflow": "Send new bookings to my system", "firm": "My firm",
  "booking": { "id": "…", "reference": "BK-00012", "status": "upcoming", "service": "Consult", "staff": "Asha",
               "start": "2026-10-19T04:30:00.000Z", "end": "2026-10-19T05:00:00.000Z", "cancellationReason": null },
  "client": { "name": "Ravi", "phone": "+919876543210", "email": "ravi@example.com" } }
```
Check `X-Signature: sha256=<HMAC-SHA256 of the raw body with WORKFLOW_WEBHOOK_SECRET>`.
