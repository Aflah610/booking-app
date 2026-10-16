# What the code does (phase 1 and 2)

A plain-language tour of the booking app as it stands after phase 1 (foundation) and phase 2 (booking
engine). For the engineering rules see [AGENTS.md](../AGENTS.md); for the website API see
[website-api.md](website-api.md).

## The big picture

There are two ways into the app:

1. **The staff dashboard.** Staff sign in with Google (or Zoho) and manage services, working hours,
   bookings and clients. These are the only screens in the app.
2. **The website API.** Clients never see this app. The firm's own website asks it for free times and
   creates bookings through `/api/v1/...`, using a secret API key.

Everything is stored in one Postgres database on Neon.

## Screens (what each page in the dashboard does)

The menu on the left changes with your role (staff, manager or admin).

| Menu item | Address | What you can do there | Who sees it |
|-----------|---------|-----------------------|-------------|
| Today | `/` | "My day" (your appointments today) and "Coming up" | Everyone |
| Bookings | `/admin/bookings` | List of upcoming and past appointments | Everyone |
| New booking | `/admin/bookings/new` | Book a client in: pick service, staff, day and a free time | Everyone |
| One booking | `/admin/bookings/<id>` | See details, move it to another time, or cancel it | Everyone |
| Calendar | `/admin/calendar` | Bookings laid out by day | Everyone |
| Availability | `/admin/staff/<your id>` | Your weekly hours, one-off date changes, time off, profile | Everyone (their own) |
| Services | `/admin/services` | Add and edit what clients can book: length, price, buffers, booking rules | Manager, admin |
| Staff | `/admin/staff` | Add people, set roles, choose which services they offer | Manager, admin |
| Clients | `/admin/clients` | Everyone who has booked, matched by mobile number; edit notes and WhatsApp consent | Manager, admin |
| Settings | `/admin/settings` | Firm name, time zone, and default booking rules (notice, how far ahead, cancel cut-off) | Admin |
| Login | `/login` | Sign in with Google or Zoho | Anyone |

## Folders

```
src/app/            The pages above and the API addresses. Kept thin: they read the request,
                    check who you are, and hand off to a feature.
  admin/            Dashboard screens (one folder per menu item) and their form actions
  api/v1/           Website API: services, staff, availability, slot-holds, bookings
  api/auth/         Google / Zoho sign-in
  login/            Sign-in page
src/components/     Shared building blocks: page shell and menu, hours editor, status badges,
                    time zone picker, icons
src/features/       The actual logic, one folder per topic:
  staff/            People, roles, which services they offer
  catalog/          Services clients can book
  schedules/        Weekly hours, date overrides, time off
  availability/     Works out free start times (slots.ts is the engine)
  bookings/         Create, hold a time for 5 minutes, move, cancel
  clients/          Client records, matched by phone number
  settings/         Firm-wide defaults
  api-keys/         Keys the website uses to call the API
  audit/            A log of who changed what
  health/           The "is the app OK?" check
  shared/           Errors, money and phone formatting, validation
  container.ts      Connects each feature to its database code
src/db/             Database table definitions and connection
src/lib/            Small helpers: settings check, dates and time zones, sign-in session
drizzle/            Database changes (migrations), applied in order
scripts/            Commands: apply migrations, create an API key
tests/              Automated tests (run against a real database)
docs/               Guides: website API, reliability design, deploy, WhatsApp message drafts
```

Inside each feature folder the files follow one pattern: `*.dto.ts` (the shape of the data),
`*.schemas.ts` (checks on what people type in), `*.repository.ts` (the only code that reads or writes the
database) and `*.service.ts` (the business rules).

## How a booking works

1. The website asks for free times (`/api/v1/availability`). The engine takes each staff member's weekly
   hours, applies date overrides and time off, removes existing bookings (plus buffers) and times held by
   someone else, and applies the notice and "how far ahead" rules.
2. Optionally the website holds a time for 5 minutes while the client fills in their details.
3. The website creates the booking. The database itself refuses two bookings that overlap for the same
   person, so a double booking can't slip through even under heavy traffic.
4. The client gets a private manage link to move or cancel it, up to the cut-off set in Settings
   (24 hours by default).

Staff can do the same from **Bookings → New booking**.

## Not built yet

| Missing | What it means today |
|---------|---------------------|
| Google Calendar sync | The database tables are ready, but staff's Google Calendar events don't block times yet and bookings aren't added to their calendar. |
| Notifications | No WhatsApp or email confirmations or reminders are sent. The WhatsApp consent checkbox is saved for when they arrive (phase 3). |
| Rate limits | Nothing stops someone from calling the booking API very fast. Planned in [reliability-design.md](reliability-design.md). |
| API key screen | Keys can only be made from the command line (`npm run api-key:create -- "Website"`); there's no page to create or revoke them. |
| Packages | Tables exist for prepaid packages of sessions, but there are no screens or rules for them yet. |

## Running it on your computer

You only do steps 1 and 2 once.

1. **Fill in the Google login values.** Open the file `.env.local` in VS Code (it's in the left-hand file
   list). Near the bottom are two empty lines, `AUTH_GOOGLE_ID=` and `AUTH_GOOGLE_SECRET=`. Paste the
   values in after the `=` sign. You can copy them from Vercel: open your project, then
   **Settings → Environment Variables**, click the eye icon next to each one. Save the file.
2. **Allow Google login on your computer.** Go to
   [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), click your
   OAuth client, and under **Authorised redirect URIs** click **Add URI** and paste
   `http://localhost:3000/api/auth/callback/google`. Click **Save**.
3. **Start the app.** In VS Code choose **Terminal → New Terminal** from the top menu, type `npm run dev`
   and press Enter. Wait for the line that says `Ready`.
4. **Look at it inside VS Code.** Press `Cmd + Shift + P`, type `Simple Browser`, pick
   **Simple Browser: Show**, and enter `http://localhost:3000`. The app opens in a panel next to your code.
   If Google sign-in doesn't work inside that panel, open `http://localhost:3000` in Chrome instead;
   Google sometimes blocks sign-in inside editor panels.
5. **Make a design change.** Edit a page (for example `src/app/admin/services/page.tsx`) or the colours
   and fonts in `src/app/globals.css`, then save. The preview updates by itself within a second or two.
6. **Stop the app.** Click in the terminal and press `Ctrl + C`.

Right now your computer uses the same Neon database branch (`production`) as the live site, so bookings,
staff and services you add while testing are real data. For safer testing, create a separate branch in
Neon (**Branches → Create branch**), and paste its connection string into `DATABASE_URL` in `.env.local`.

## Putting changes live (when you're ready)

When the Vercel project is connected to the GitHub repository (Vercel → project → **Settings → Git**), the
live site updates itself whenever new code lands on the `main` branch.

1. In VS Code, click the **Source Control** icon on the left (the branching lines).
2. Type a short message describing the change, for example `Change button colours`, and click **Commit**.
3. Click **Sync Changes** (or **Publish Branch**) to send it to GitHub.
4. Open [vercel.com](https://vercel.com), click the project, then **Deployments**. Wait for the newest one
   to show **Ready**, then open the site to check it.

If you'd rather review changes before they go live, ask Claude to put them on a separate branch and open a
pull request; Vercel gives each one its own preview link.
