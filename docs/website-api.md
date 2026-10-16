# Website booking API (v1)

For the firm's website server. Send the API key as `Authorization: Bearer bk_...` (create one with
`npm run api-key:create -- "Website"`). All times are ISO 8601 in UTC; the firm's time zone comes back with
availability so the website can show local times.

| Step | Call | Notes |
|------|------|-------|
| 1 | `GET /api/v1/services` | Bookable services |
| 2 | `GET /api/v1/staff?service=<id>` | Optional: who offers it |
| 3 | `GET /api/v1/availability?serviceId=&staffId=&from=&to=` | Free start times; leave out `staffId` for anyone. At most 62 days |
| 4 | `POST /api/v1/slot-holds` `{ serviceId, staffId?, start }` | Optional: holds the time for 5 minutes, returns `token` |
| 5 | `POST /api/v1/bookings` with header `Idempotency-Key` | `{ serviceId, staffId?, start, holdToken?, client: { name, phone, email?, whatsappOptIn? }, notes? }` |
| – | `GET /api/v1/bookings/{id}` | Header `X-Manage-Token` |
| – | `POST /api/v1/bookings/{id}/reschedule` `{ start, holdToken? }` | Header `X-Manage-Token`; returns the new booking |
| – | `POST /api/v1/bookings/{id}/cancel` `{ reason? }` | Header `X-Manage-Token` |
| – | `DELETE /api/v1/slot-holds/{token}` | Let a hold go early |

## Things the website must handle

- **201** on a new booking, with `manageToken`. It is shown only once: keep it with the client's booking
  (for example in the confirmation link) so they can move or cancel it later.
- **200 + `Idempotent-Replayed: true`** when a retry with the same `Idempotency-Key` hits a booking that
  already exists. Use a fresh random key per booking attempt, and the same key when retrying it.
- **409** when the time was just taken or is held by someone else (`details.reason`: `slot_taken`,
  `slot_held`, `slot_unavailable`, `hold_expired`). Show fresh times and let the client pick again.
- **403** when the client tries to move or cancel inside the cut-off set in Settings (24 hours by default).
- Phone numbers without a country code are treated as Indian (`98765 43210` → `+919876543210`).
