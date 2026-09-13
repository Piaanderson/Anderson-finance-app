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
preview infrastructure changes and `railway config apply` to apply them.

Only `web` receives a public domain. Reference the PostgreSQL service's private
`DATABASE_URL` from all three application services. Railway cron schedules use
UTC, have a five-minute minimum interval, and skip a run if the prior execution
has not exited.

The canonical Git remote is GitLab. `.gitlab-ci.yml` verifies changes, and
GitLab push-mirrors `main` to the private GitHub repository used by Railway's
repository integration. Do not add a GitHub remote or put a Railway token in
the repository.

## Required web variables

Copy the names from `.env.example`. In production:

- set `AUTH_SECRET`, Google OAuth credentials, and the public `AUTH_URL`;
- set Plaid production credentials, `PLAID_ENV=production`, and an HTTPS
  `PLAID_WEBHOOK_URL`;
- set a random `TOKEN_ENCRYPTION_KEY` and version;
- do not define `AUTH_DEV_BYPASS`;
- set `NEXT_TELEMETRY_DISABLED=1`.

The worker needs `DATABASE_URL`, Plaid credentials, `PLAID_ENV`, and encryption
variables. The cron needs only `DATABASE_URL`. Use
`${{Postgres.DATABASE_URL}}` on all three services rather than copying database
credentials. Keep secret values in Railway; `.railway/railway.ts` preserves
them without writing them to source.

## Deploy sequence

The web and worker services run `prisma migrate deploy` before starting. Deploy
PostgreSQL first, web second, then worker and cron. The web health check is
`/api/health`. Configure the Google redirect URI as
`https://<domain>/api/auth/callback/google` and the Plaid webhook as
`https://<domain>/api/plaid/webhook` after Railway assigns the domain.

## Backups and recovery

Enable daily volume backups on PostgreSQL and point-in-time recovery when the
plan supports it. Also create a portable encrypted logical backup:

```bash
pg_dump "$DATABASE_PUBLIC_URL" --format=custom --file=currents.dump
pg_restore --clean --if-exists --no-owner --exit-on-error \
  --dbname="$RESTORE_DATABASE_URL" currents.dump
```

Quarterly, restore into a disposable database, run `npx prisma migrate status`,
check household/account/transaction counts, and record the date. A backup that
has never been restored is unverified. Do not commit dump files.

## Operations

- Set monthly usage alerts and a hard spending limit in Railway.
- Keep worker logs structured by event and job ID; never add Plaid payloads.
- A failed sync retries with exponential backoff and stops after eight
  attempts. A later webhook or reconciliation run reopens the deduplicated job.
- Investigate `LOGIN_REQUIRED` Items by launching Plaid update mode before
  adding more retries.
- Run migrations forward; create a backup before any destructive migration.
