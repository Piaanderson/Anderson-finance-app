# Currents

Currents is a household-scoped personal finance application built with Next.js,
PostgreSQL, Prisma, Auth.js, and Plaid. The approved static design work remains
under `prototype/` as the visual and interaction reference.

## Local setup

Prerequisites: Node 22+, npm, and PostgreSQL.

1. Copy `.env.example` to `.env` and fill in the local values.
2. Run `docker compose up -d --wait` (or create the PostgreSQL database named
   in `DATABASE_URL` yourself).
3. Run `npm ci` for a reproducible install from `package-lock.json`.
   Before the first browser-test run, install Chromium with
   `npx playwright install chromium`.
4. Run `npm run db:migrate && npm run db:seed`.
5. Run `npm run dev`, then open `http://localhost:3000`.
6. In another terminal, run `npm run worker` to process Plaid sync jobs.

For a local-only sign-in, set `AUTH_DEV_BYPASS=true`. This provider is compiled
out in production. Plaid Sandbox credentials are sufficient for development.

## Commands

- `npm run dev` — start the web application
- `npm run worker` — process Plaid account and transaction sync jobs
- `npm run cron:sync` — enqueue reconciliation syncs and exit
- `npm run typecheck`, `npm run lint`, `npm test` — verify changes
- `npm run test:e2e` — run Playwright accessibility smoke tests
- `npm run build` — create the production build

## Structure

- `src/app/(app)/` — authenticated route-level pages and shared layout
- `src/components/` — reusable shell and UI components
- `src/features/` — account, budget, transaction, and category features
- `src/server/` — household-scoped persistence, Plaid, encryption, and jobs
- `prisma/` — schema, migrations, and safe demo seed
- `prototype/` — preserved `.dc.html` design artifacts
- `docs/` — security and Railway operating procedures

See `docs/SECURITY.md` before using real financial data and
`docs/RAILWAY.md` before deployment.
