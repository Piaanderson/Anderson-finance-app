# Railway deployment

Railway hosts the web application, worker, reconciliation cron, PostgreSQL, and
their secrets. It does not provide GPU instances; a future AI feature should
call a hosted model provider over HTTPS.

## Project topology

The project is defined in `.railway/railway.ts` using Railway Infrastructure
as Code:

1. an official PostgreSQL service;
2. a `web` service from the mirrored GitHub repository;
3. a `worker` service from the same repository;
4. a `sync-cron` service scheduled at `17 */6 * * *`.

Railway deprecated per-service `railway.toml` Config as Code for new services
and will stop reading it on December 1, 2026. Use `railway config plan` to
preview infrastructure changes and `railway config apply` to apply them. These
commands require the separate Railway platform CLI 5.42.1 or newer; the
`railway` package in this repository is the TypeScript IaC SDK, not that CLI.
Without a global install, run
`npx --yes @railway/cli@5.57.12 config plan`.

Only `web` receives a public domain. Reference the PostgreSQL service's private
`DATABASE_URL` from all three application services. Railway cron schedules use
UTC, have a five-minute minimum interval, and skip a run if the prior execution
has not exited.

The canonical Git remote is GitLab. `.gitlab-ci.yml` verifies changes, and
GitLab push-mirrors `main` to the private GitHub repository used by Railway's
repository integration. Do not add a GitHub remote or put a Railway token in
the repository.

## Required web variables

Copy the names from `.env.example`. Keep local, CI, staging, and production
isolated. Do not copy values across those contexts.

In production:

- set `AUTH_SECRET` and the public `AUTH_URL`;
- set `PASSKEY_RP_ID` to the public hostname, `PASSKEY_ORIGIN` to its HTTPS
  origin, and `PASSKEY_RP_NAME=Currents`;
- do not define `PASSKEY_BOOTSTRAP_TOKEN` after the owner passkey exists;
- set Plaid environment to `development` (Trial) or `production` only after
  those credentials are approved; never leave production on another context's
  secrets;
- set a random `TOKEN_ENCRYPTION_KEY` and version;
- do not define `AUTH_DEV_BYPASS`;
- set `NEXT_TELEMETRY_DISABLED=1`.

The worker needs `DATABASE_URL`, Plaid credentials, `PLAID_ENV`, and encryption
variables. The cron needs only `DATABASE_URL`. Wire
`Postgres.env.DATABASE_URL` on all three application services rather than
copying database credentials. Keep secret values in Railway; `.railway/railway.ts`
preserves them without writing them to source.

GitLab CI must keep using its disposable PostgreSQL service and the job-level
`DATABASE_URL` in `.gitlab-ci.yml`. It must not define Plaid, encryption, or
Railway credentials.

## Environment isolation

Prove isolation from metadata, not from variable names:

- Local Compose PostgreSQL listens on `127.0.0.1:5432` for database `currents`.
- GitLab CI uses `postgres:17-alpine` and `currents_test` only.
- Railway production PostgreSQL is private (`postgres.railway.internal`) and is
  referenced by web, worker, and cron.
- Only the `web` service may have a public domain. Worker, cron, and PostgreSQL
  stay private.
- Passkey origin, `AUTH_URL`, encryption keys, Auth.js secrets, Plaid
  credentials, and bootstrap tokens must differ across local, staging, and
  production.
- Railway staging uses its own PostgreSQL volume, Auth.js secret, encryption
  key, passkey origin, public web domain, webhook URL, and a separate Plaid
  team with Sandbox credentials. Its public origin is
  `https://web-staging-7944.up.railway.app`. Do not duplicate production
  variables into staging.

`src/server/runtime-context.ts` fails closed when CI or local would use a
Railway database, when CI has Plaid credentials, when staging uses Plaid
Production, or when AUTH_DEV_BYPASS is enabled on Railway.

## Deploy sequence

The web and worker services run `prisma migrate deploy` before starting. Deploy
PostgreSQL first, web second, then worker and cron. The web health check is
`/api/health`. Passkeys are bound to the configured production hostname, so
changing domains requires a deliberate credential migration. Configure the
Plaid webhook as `https://<domain>/api/plaid/webhook` after Railway assigns the
domain.

## Backups and recovery

Production point-in-time recovery uses pgBackRest with continuous WAL
archiving, weekly full backups, daily incremental backups, and approximately
four weeks of retention. Verify it without restoring:

```bash
railway postgres pitr status --service Postgres --environment production --json
```

Railway volume-backup schedules are separate. Daily snapshots are retained for
6 days, weekly snapshots for 1 month, and monthly snapshots for 3 months.
Snapshots are incremental and billed at the volume-storage rate for unique
data. The approved production cadence is daily plus weekly:

```bash
railway postgres pitr schedule set --daily --weekly \
  --service Postgres --environment production --json
railway postgres pitr schedule list \
  --service Postgres --environment production --json
```

As of 2026-09-28, PITR is healthy but the schedule command returns
`OAUTH_INSUFFICIENT_GRANT` for the current Railway integration. No volume
schedule is active. An authorized workspace owner must enable Daily and Weekly
under PostgreSQL → Backups; do not claim scheduled backups until
`schedule list` returns both.

Also create a portable encrypted logical backup:

```bash
pg_dump "$DATABASE_PUBLIC_URL" --format=custom --file=currents.dump
pg_restore --clean --if-exists --no-owner --exit-on-error \
  --dbname="$RESTORE_DATABASE_URL" currents.dump
```

Quarterly, restore into a disposable database, run `npx prisma migrate status`,
check household/account/transaction counts, and record the date. A backup that
has never been restored is unverified. Do not commit dump files.

## Operations

- Set a $15 monthly workspace usage alert and a $40 hard limit in Railway.
  Recheck with `railway usage limit status --target workspace --json`. As of
  2026-09-28, Railway rejects this setting because the workspace has no active
  subscription; the limit remains unset. A hard limit stops all services,
  including production.
- The worker and six-hour cron emit an `ops.snapshot` event with pending,
  running, and failed job counts, pending lag, login-required Items, error
  Items, and stale active Items. Counts only; never payloads.
- Local operators can print the same snapshot with `npm run ops:snapshot`
  against a non-production database.
- A failed sync retries with exponential backoff and stops after eight
  attempts. A later webhook or reconciliation run reopens the deduplicated job.
- Investigate `LOGIN_REQUIRED` Items by launching Plaid update mode before
  adding more retries.
- Run migrations forward; create a backup before any destructive migration.

## Encryption-key rotation

Rotation is permitted only in staging. The exercise refuses CI, local, and
production, requires an empty staging Item population, creates one synthetic
Sandbox-token fixture, rotates it transactionally, verifies changed
ciphertext and current-key decryption, proves the previous key is still
present, verifies every non-removed staging Item is current, and removes the
fixture.

1. Retain the current staging key as
   `TOKEN_ENCRYPTION_KEY_V<old version>` on web and worker.
2. Generate a new 32-byte base64 key with `openssl rand -base64 32`.
3. Set it as `TOKEN_ENCRYPTION_KEY` and increment
   `TOKEN_ENCRYPTION_KEY_VERSION` on staging web and worker together.
4. Redeploy both services and run this inside the staging worker:

```bash
npm run ops:exercise-token-rotation
```

5. Preserve only the safe JSON result. It must report one rotation, zero old
   rows, changed ciphertext, successful current-key decryption, retained old
   key, complete current-version coverage, and fixture cleanup.
6. Keep the old key until migration completion is independently confirmed.

Never rotate production keys or remove an old version without explicit
approval and proof that no ciphertext remains on the previous version.
