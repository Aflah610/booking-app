# Deploying to Vercel

The app runs on Vercel (functions) with Postgres on Neon. Two things differ from running on your own computer or a server:

1. **Nothing keeps a timer running.** The built-in 30-second worker is switched off on Vercel. A scheduler calls
   `GET /api/internal/jobs/run` instead (fails unpaid bookings at 10 minutes and cancels at 24 hours, sends due workflow
   messages, writes bookings to Google Calendar, refreshes busy times). It needs `CRON_SECRET`.
2. **Migrations are not run by the build.** Run them yourself against the production database before the code that needs them
   goes live: `DATABASE_URL=<unpooled production url> npm run db:migrate`.

## Environment variables (Vercel → Project → Settings → Environment Variables → Production)

Add secrets in the dashboard (or `vercel env add NAME production`). Never put them in chat or in the repository.

| Name | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | everything | Neon **pooled** URL |
| `DATABASE_URL_UNPOOLED` | migrations | Neon direct URL |
| `AUTH_SECRET` | sessions, manage links | `openssl rand -hex 32` |
| `AUTH_URL` | sign-in, links in emails, Google redirect | your public address, e.g. `https://book.yourfirm.com` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | staff sign-in | add the redirect `https://<domain>/api/auth/callback/google` |
| `ADMIN_EMAILS` | first admin | comma-separated |
| `ALLOWED_EMAIL_DOMAIN` | optional | only this email domain can sign in |
| `CRON_SECRET` | background jobs | `openssl rand -hex 32` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | email | see docs/workflows.md |
| `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | Calendar and Meet | add the redirect `https://<domain>/api/calendar/google/callback` |
| `CALENDAR_ENCRYPTION_KEY` | stored Google tokens | `openssl rand -hex 32`; keep it, changing it disconnects every calendar |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | WhatsApp | optional |
| `WORKFLOW_WEBHOOK_SECRET` | signed webhooks | optional |

Do **not** set `LOCAL_LOGIN_PASSWORD` in production (it is ignored in production builds anyway).

## Background jobs

Two things make work happen:
1. **Straight after a booking changes** the app starts the follow-up itself, once the response has gone back (Next.js `after`): the Google
   Calendar event with its Meet link, and the confirmation message. This needs no scheduler, so a new booking gets its link within seconds.
2. **A scheduler** calls the jobs route for everything that happens with the passing of time: the 10-minute and 24-hour payment timeouts,
   reminders and other delayed messages, retries after Google or the mail server failed, and refreshing busy times.
   **Without a scheduler these never happen**, so set one up before real use.

Call `GET /api/internal/jobs/run` with `Authorization: Bearer $CRON_SECRET` every minute or two.
- **Vercel Cron** (Pro plan): `vercel.json` → `{ "crons": [{ "path": "/api/internal/jobs/run", "schedule": "* * * * *" }] }`.
  Vercel sends the bearer token itself when `CRON_SECRET` is set. Hobby plans are limited to rarer schedules.
- **Free alternative:** any scheduler (cron-job.org, a GitHub Actions schedule every 5 minutes) sending that header.
- Every minute keeps the Neon database awake all day. To save compute, schedule it only for working hours (e.g. `*/2 3-17 * * *` in UTC).

## Region

Functions run next to the database. Pick a Neon region near your users (Singapore `aws-ap-southeast-1`, or Mumbai if Neon offers it)
and set the functions to match in `vercel.json` (`"regions": ["sin1"]`, Mumbai is `bom1`). A database in the US with users in India adds
about a quarter of a second to every page.

## Checklist before real use

1. Production database created, `npm run db:migrate` run against it.
2. All variables above set; Google redirect addresses added; custom domain attached and `AUTH_URL` set to it.
3. Scheduler calling the jobs route (check the response in the logs: `{ "data": { ... } }`).
4. First admin signs in; add a service, a therapist, working hours, an API key (`npm run api-key:create -- "Website"`).
5. Smoke test: book through the API, email arrives, Google Calendar event appears, a Meet link is made, a payment report and a package purchase are recorded.
6. Backups: know your Neon restore window; add error monitoring and an uptime check on `/api/v1/health`.
