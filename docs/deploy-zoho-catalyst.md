# Deploy to Zoho Catalyst AppSail with Neon Postgres

The app runs as a Docker container on AppSail. The database is Neon Postgres, because Catalyst's own Data
Store uses ZCQL rather than Postgres.

## 1. Create the Neon database

1. Sign up at neon.tech and create a project named `booking`.
2. Pick the region closest to your Zoho data centre (for the India DC, choose AWS Asia Pacific (Mumbai) or
   Singapore; for the US DC, a US East region; for the EU DC, Frankfurt).
3. Copy the **pooled** connection string. It looks like
   `postgres://user:password@ep-xxx-pooler.region.aws.neon.tech/booking?sslmode=require`. This is your
   `DATABASE_URL`. Keep it secret.

## 2. Create the Google login client

1. In Google Cloud Console, open **APIs & Services > Credentials > Create credentials > OAuth client ID**.
2. Type: **Web application**.
3. Authorised redirect URI: `https://<your-appsail-domain>/api/auth/callback/google` (add the localhost one
   too if you develop locally). You can add the AppSail URL after the first deploy.
4. Copy the client ID and secret. These are `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
5. On the OAuth consent screen, set the user type to **Internal** if the firm uses Google Workspace, so only
   firm accounts can sign in.

## 3. Build and deploy the container

Install the Catalyst CLI (`npm install -g zcatalyst-cli`), run `catalyst login`, and from this repo:

```bash
docker build -t booking-app:latest .
catalyst deploy appsail --name booking-app --source docker://booking-app:latest -ni
```

The container listens on `X_ZOHO_CATALYST_LISTEN_PORT`, which AppSail sets for you.

## 4. Set environment variables

In the Catalyst console: **AppSail > booking-app > Configuration > Environment Variables**. Add every
variable from `.env.example`:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | Output of `openssl rand -hex 32` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | From step 2 |
| `AUTH_URL` | The AppSail URL, e.g. `https://booking-app-xxxx.development.catalystappsail.in` |
| `ADMIN_EMAILS` | Your email (you become the first admin) |
| `ALLOWED_EMAIL_DOMAIN` | Optional, e.g. `yourfirm.com` |
| `RUN_MIGRATIONS` | `true` |

Keep `catalyst_auth` off for this app: it uses its own Google login.

## 5. Health check and first login

- Set the AppSail health check path to `/api/v1/health`. It returns `{"status":"ok"}` when the database is
  reachable.
- Open the AppSail URL, sign in with the Google account listed in `ADMIN_EMAILS`, then add staff and services.

## 6. Create the website's API key

From your computer, with `DATABASE_URL` pointing at Neon:

```bash
DATABASE_URL="<neon url>" npm run api-key:create -- "Website"
```

Give the printed key to your web developer for the website's server environment.

## Moving to AWS later

Push the same image to Amazon ECR and run it on App Runner, ECS or Lightsail. Either keep Neon or move the
data to Amazon RDS for Postgres with `pg_dump` / `pg_restore`, then change `DATABASE_URL`. Nothing in the code
changes. Use `PORT` instead of `X_ZOHO_CATALYST_LISTEN_PORT` (the app reads either).

## Variable names without underscores

The Catalyst console rejects underscores in variable names. Enter each setting without them (`DATABASEURL`,
`AUTHSECRET`, `AUTHGOOGLEID`, `ADMINEMAILS`, `RUNMIGRATIONS` ...). The container's entrypoint maps them back to the
real names on start. A variable that is set under its real name always wins.
