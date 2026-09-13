# Railway deployment

Railway hosts the web application, worker, reconciliation cron, PostgreSQL, and
their secrets. It does not provide GPU instances; a future AI feature should
call a hosted model provider over HTTPS.

## Project topology

Create one Railway project with:

1. an official PostgreSQL service;
2. a `web` service from this repository using `railway.web.toml`;
3. a `worker` service from the same repository using `railway.worker.toml`;
4. a `sync-cron` service using `railway.cron.toml` and schedule `17 */6 * * *`.

Only `web` receives a public domain. Reference the PostgreSQL service's private
`DATABASE_URL` from all three application services. Railway cron schedules use
UTC, have a five-minute minimum interval, and skip a run if the prior execution
has not exited.

The current Git remote is GitLab. Use `.gitlab-ci.yml` for verification and
either mirror the repository to GitHub for Railway's repository integration or
deploy from GitLab CI with an authenticated Railway token. Do not put that token
in the repository.

## Required web variables

Copy the names from `.env.example`. In production:

- set `AUTH_SECRET`, Google OAuth credentials, and the public `AUTH_URL`;
- set Plaid production credentials, `PLAID_ENV=production`, and an HTTPS
  `PLAID_WEBHOOK_URL`;
- set a random `TOKEN_ENCRYPTION_KEY` and version;
- do not define `AUTH_DEV_BYPASS`;
- set `NEXT_TELEMETRY_DISABLED=1`.

The worker needs `DATABASE_URL`, Plaid variables, and encryption variables. The
cron needs only `DATABASE_URL`. Use Railway reference variables rather than
copying database credentials.

## Deploy sequence

The web and worker configs run `prisma migrate deploy` before starting. Deploy
PostgreSQL first, web second, then worker and cron. Set the web health check to
`/api/health`. Configure Plaid and Google callback URLs only after Railway has
assigned the production domain.

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
