# Booking app

Booking system for the firm. Staff use the dashboard in this app; clients book only through the firm's own
website, which calls this app's REST API. There are no client-facing pages here.

**Status: phase 1 (foundation).** Database, staff Google login, admin screens for staff, services, working
hours and time off, and the first API endpoints. The availability engine and bookings arrive in phase 2,
the full website API and WhatsApp/email notifications in phase 3.

## Stack

Next.js 16 (TypeScript) · Postgres (Neon) via Drizzle ORM · Auth.js with Google · Tailwind · Zod · Vitest.
Packaged as one Docker image that runs on Zoho Catalyst AppSail, AWS or any server.

## Run it locally

You need Node 22 and a Postgres database (a free Neon project, or `docker compose up db`).

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, Google values, ADMIN_EMAILS
npm run db:migrate
npm run dev                 # http://localhost:3000
```

For Google login locally, add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI
on your Google OAuth client. The first person to sign in with an email listed in `ADMIN_EMAILS` becomes an
admin and can add everyone else under **Staff**.

## Roles

| Role    | Can do |
|---------|--------|
| Staff   | Sign in, edit their own working hours and time off |
| Manager | Everything staff can, plus manage staff (not admins) and services |
| Admin   | Everything, including adding admins and changing roles |

## API for the website

All endpoints live under `/api/v1` and need an API key in the `Authorization: Bearer <key>` header.
Keep the key on the website's server; never put it in browser code.

Create a key (shown once, only its hash is stored):

```bash
npm run api-key:create -- "Website"
```

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/v1/health` | Health check (no key needed) |
| GET | `/api/v1/services` | Active services with duration and price shown |
| GET | `/api/v1/staff?service=<id>` | Staff who offer a service |

```bash
curl -H "Authorization: Bearer $BOOKING_API_KEY" https://<app-domain>/api/v1/services
# {"data":[{"id":"…","name":"Consultation","description":null,"durationMin":30,"priceDisplay":"₹1,500"}]}
```

Errors look like `{"error":{"code":"unauthorized","message":"Missing or invalid API key"}}`.

## Tests

Tests run against a real Postgres database, which they wipe. Point them at a throwaway database:

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/booking_test npm test
```

`npm run lint`, `npm run typecheck` and `npm test` must pass before a PR; CI runs them plus a build and a
Docker build.

## Deploy

- How it stays correct under heavy traffic: [docs/reliability-design.md](docs/reliability-design.md)
- Zoho Catalyst AppSail + Neon: [docs/deploy-zoho-catalyst.md](docs/deploy-zoho-catalyst.md)
- Your own server: `docker compose up --build` (Postgres included)
- AWS: run the same image on App Runner, ECS or Lightsail with Amazon RDS for Postgres; set the same
  environment variables.

## Project layout

Organised by domain (vertical slices), following the architecture Cal.com publishes for its open-source code:

```
src/features/<domain>/   one folder per domain: staff, catalog, schedules, api-keys, audit, health
  *.dto.ts               plain types that cross boundaries
  *.schemas.ts           Zod input validation
  *.repository.ts        the only code that talks to the database
  *.service.ts           business rules; gets its repository injected
src/features/container.ts  wires repositories into services (`app()`)
src/db/                  Drizzle schema and connection
src/app/                 Next.js routes: /api/v1, /admin screens, /login (thin)
drizzle/                 SQL migrations (committed)
scripts/                 migrate and create-api-key commands
tests/                   Vitest tests against Postgres
docs/                    deploy guide, WhatsApp template drafts
```

Engineering rules for contributors are in [AGENTS.md](AGENTS.md).
