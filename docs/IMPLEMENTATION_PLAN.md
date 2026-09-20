# Currents implementation plan

Last updated: 2026-09-19

## Current status

- Release target: secure, polished private-household v1
- Current phase: Phase 1 — Plaid reliability and authorization
- Roadmap issue:
  [#1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/1)
- Milestone:
  [Currents Private v1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/milestones/1)
- Board:
  [Currents Private v1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/boards/11624000)
- Canonical remote: GitLab; GitHub is a server-side deployment mirror only
- Next action: execute
  [#4 Harden Plaid webhook verification and sync jobs](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/4)

## Product finish line

Currents is complete for private v1 when it provides:

- Plaid-connected and manual accounts across Cash, Invested, Property, and Debt
- reliable transaction synchronization and recoverable connection states
- one-row transfer movements with honest, expandable two-leg details
- keyboard-accessible transfer and category review
- editable monthly budgets tied to real categories, accounts, and movements
- accurate net worth, cash-flow, spending, savings, and debt reporting
- complete Home, Budget, Accounts, Transactions, and Categories experiences
- passkey authentication and recovery
- WCAG 2.1 AA behavior on desktop and mobile
- tested Railway web, worker, cron, PostgreSQL, backup, and recovery operations

Public registration, multiple households per user, invitations, billing, and
commercialization are explicitly outside private v1. They remain a future
phase so the current architecture does not make them impossible.

## Non-negotiable decisions

1. Every finance record is household-scoped. Derive the household from the
   authenticated membership; never accept a household ID from the client.
2. Plaid tokens remain encrypted and server-only.
3. Webhooks are signature-verified and enqueue idempotent work. They never run
   a full synchronization inline.
4. GitLab is canonical. Push only to GitLab; its server-side mirror supplies
   GitHub for Railway.
5. Prototype files under `prototype/` are read-only design references.
6. Dark mode and the production Nocturne tokens remain the visual foundation.
7. Accessibility and reduced-motion behavior ship with each feature.
8. Historical balances are never fabricated. Sourced, derived, estimated, and
   unavailable values must be distinguished in UI copy.
9. Each implementation slice must be independently testable and leave this
   document with an exact next action.

## Approved experience requirements

The durable design decisions in `CLAUDE.md` are requirements:

- A transfer appears once and expands to its two account legs.
- Expanded details show balance movement only when it can be sourced or
  honestly derived, plus the bank description, memo, and reference available.
- Transactions surface unmatched legs and support reversible tie/untie.
- Review is transfers first, categories second, keyboard-operable, and hidden
  when no work remains.
- Budget uses the 2c summary header and allocation summary.
- Budget summary language is “moved / due,” not “of.”
- All budget sections use the 2a paired budget-to-destination row.
- Flex rows show planned, spent, and remaining or over.
- Accounts are grouped as Cash, Invested, Property, and Debt.
- Any net-worth sparkline is labelled “Net worth, last 8 months” or omitted.
- Mortgage remains in Needs with owed and home-value context.

## Target architecture

```text
Plaid ──> Next.js web ──> SyncJob ──> Railway worker ──> PostgreSQL
  │            │                                        │
  └─ webhooks ─┘                                        │
                                                       │
Manual accounts and valuations ──> server actions/API ─┤
                                                       │
PostgreSQL ──> movement/budget/reporting services ──> app pages
```

Execution contexts stay isolated:

1. Local — Plaid Sandbox, optional development sign-in, local PostgreSQL.
2. CI — ephemeral PostgreSQL, no real Plaid credentials.
3. Staging — Sandbox or Trial Plaid, production-shaped auth and Railway.
4. Production — Plaid Production, private household data, no development
   bypass or bootstrap credential.

## Phase 0 — Roadmap and execution baseline

Goal: make the plan and backlog durable before feature work.

- [x] Choose private-household v1 as the primary finish line.
- [x] Include a full balance sheet with Plaid and manual assets/debts.
- [x] Preserve this roadmap in the repository.
- [x] Create the `Currents Private v1` GitLab milestone.
- [x] Create workflow, phase, area, priority, and type labels.
- [x] Create the roadmap issue and vertical-slice backlog.
- [x] Create the GitLab Issue Board.
- [x] Reconcile the generated `next-env.d.ts` change.
- [x] Run and record the baseline verification suite.
- [x] Verify Sandbox connect/sync and current Railway service health.

Exit evidence:

- clean working tree after a GitLab commit
- green typecheck, lint, unit tests, build, migrations, and browser tests
- working Sandbox synchronization through the worker
- GitLab backlog linked from this document

## Phase 1 — Plaid reliability and authorization

Goal: make the existing ingestion path safe to rely on before expanding UI.

- Test valid and invalid webhook signatures, stale timestamps, and body hashes.
- Test sync cursor pagination and added, modified, and removed transactions.
- Test job deduplication, retry, rerun, and interrupted-worker recovery.
- [x] Add negative cross-household tests for every mutating finance endpoint.
- Bound transaction sizes for large initial syncs.
- Normalize Plaid errors into actionable Item states.
- Add update mode for `LOGIN_REQUIRED`.
- Add account refresh, reconnect, disconnect, last-sync, and status controls.
- Surface failed or stale syncs without logging private financial data.

Exit evidence:

- connect, disconnect, reconnect, webhook, manual sync, and reconciliation pass
- retries produce no duplicate transactions
- every mutation rejects another household’s identifiers
- logs contain no access tokens or transaction payloads

## Phase 2 — Full balance-sheet domain

Goal: support Plaid and manual financial positions through one honest model.

- Add account-source and financial-classification enums.
- Generalize financial accounts so manual records do not require Plaid IDs.
- Define and test one balance-sign convention.
- Add account balance and manual valuation snapshots.
- Add manual property, investment, cash, and debt CRUD.
- Pair property with related debt without combining their source records.
- Make budget destination accounts explicit relations.
- Replace free-text category sections with an enum or validated domain type.
- Migrate and backfill existing data without breaking Plaid sync.

Exit evidence:

- existing Plaid data survives migration
- a manual home and related mortgage can be represented
- net worth reconciles across all four financial groups
- historical trend data comes from snapshots rather than reconstructed fiction

## Phase 3 — Transactions and movement review

Goal: implement the approved Transactions 2a workflow.

- Build a household-scoped movement read model.
- Present a matched transfer once while retaining both source transactions.
- Generate conservative transfer suggestions; never silently accept ambiguity.
- Build unmatched-leg, tie, and untie interactions.
- Store and show useful bank-provided description fields without raw payloads.
- Build expandable, structured transfer details.
- Build the transfers-first/category-second review stack.
- Build an accessible grouped category picker and merchant-rule option.
- Add visible keyboard hints, focus management, and live announcements.

Exit evidence:

- transfers count once in ledgers and reporting
- tie and untie are reversible
- wrong matches return to two honest transaction rows
- categorization and merchant rules persist through refresh
- mouse, touch, and keyboard flows all pass

## Phase 4 — Real monthly budgeting

Goal: implement the approved Budget 3a composite using household data.

- Add dynamic month navigation and remove hardcoded scenario dates from logic.
- Calculate income with a documented manual-adjustment path.
- Add editable allocations with accessible validation.
- Support copying the previous month into a new draft.
- Implement the 2c header, allocation bar, “Where it goes,” and moved/due stats.
- Implement paired planned-to-destination rows for every section.
- Implement structured Flex rows with planned, spent, remaining, and over.
- Exclude transfers from spending.
- Connect savings and debt movements to destination accounts.
- Show mortgage owed and home-value context in Needs.

Exit evidence:

- budget totals reconcile and left-to-budget responds to edits
- spending comes from categorized transactions
- transfers never inflate spending
- moved/due uses real movements
- month copy and edits survive reload

## Phase 5 — Accounts and Categories

Goal: make balance-sheet and classification maintenance complete.

Accounts:

- Build grouped Cash, Invested, Property, and Debt views with subtotals.
- Expand rows for connection status, activity, projection, and actions.
- Add manual-account and valuation editing.
- Pair property and mortgage in the equity presentation.
- Show labelled snapshot-based net-worth history when enough data exists.

Categories:

- Rename, archive, restore, move, and reorder categories.
- Provide keyboard controls for any pointer-based reordering.
- Show and edit merchant rules.
- Define safe behavior for allocations and transactions on archive or merge.

Exit evidence:

- account arithmetic reconciles to net worth
- manual and Plaid accounts behave consistently
- category maintenance preserves dependent records

## Phase 6 — Home dashboard

Goal: provide a traceable summary using the integrated prototype and 4a-style
direction as the baseline.

- Show net worth and monthly change.
- Show month pacing, income, spending, saving, and debt paydown.
- Add an explicit comparison basis.
- Add spending-by-category, recent movements, budget status, upcoming
  obligations, and account rollup.
- Use accessible charts with visible summaries and data fallbacks.

Exit evidence:

- every displayed number traces to a tested server-side calculation
- comparisons state their period and basis
- no production path depends on static scenario figures

## Phase 7 — Motion, responsive design, and accessibility

Goal: complete the intended polish without sacrificing inclusive use.

- Add restrained expansion, transfer, allocation, and number-change motion.
- Disable nonessential motion with `prefers-reduced-motion`.
- Verify desktop, tablet, and mobile layouts.
- Keep all targets at least 44 by 44 CSS pixels.
- Verify headings, landmarks, names, descriptions, live regions, form errors,
  focus order, disclosure state, contrast, and keyboard interaction.
- Run automated WCAG checks plus a manual keyboard checklist on every route.

Exit evidence:

- automated accessibility suite passes
- manual keyboard and reduced-motion checks pass
- state is never communicated by color alone
- no inaccessible custom interactive elements remain

## Phase 8 — Private production readiness

Goal: make private v1 safe to use daily with real financial data.

- Create and validate staging before production Plaid access.
- Remove development bypass and bootstrap credentials from deployed contexts.
- Finalize the production hostname before relying on passkeys.
- Complete Plaid Trial before Plaid Production.
- Monitor worker health, sync lag, failed jobs, and login-required Items.
- Exercise encryption-key rotation in staging.
- Configure Railway usage alerts and spending limits.
- Enable backups and point-in-time recovery.
- complete and record a disposable-database restore drill.
- Verify security headers and PII-scrubbed error reporting.
- Complete `docs/SECURITY.md` and `docs/RAILWAY.md` release checklists.

Exit evidence:

- daily use requires no database intervention
- failures are visible and recoverable
- a recent backup has been successfully restored
- production contains no Sandbox, bypass, or bootstrap credentials
- all private-v1 requirements have direct completion evidence

## Future commercialization phase

Do not begin without an explicit product decision:

- invitations and household switching
- public registration
- billing and entitlements
- privacy, retention, export, and deletion controls
- Plaid legal and end-user disclosures
- public threat model, abuse prevention, and external security review
- AI features only after defining a concrete user problem and privacy boundary

## GitLab backlog structure

Use one `Currents Private v1` milestone and one issue board.

Workflow labels:

- `workflow::backlog`
- `workflow::ready`
- `workflow::in-progress`
- `workflow::blocked`
- `workflow::review`

Other label families:

- `phase::0` through `phase::8`
- `area::platform`, `area::plaid`, `area::accounts`,
  `area::transactions`, `area::budget`, `area::categories`,
  `area::dashboard`, `area::accessibility`, `area::operations`
- `priority::P0`, `priority::P1`, `priority::P2`
- `type::feature`, `type::security`, `type::infrastructure`, `type::quality`

Each issue must include:

- outcome
- scope and explicit non-scope
- dependencies
- relevant files
- acceptance criteria
- accessibility criteria when UI is involved
- verification commands and runtime evidence
- plan checkboxes to update when complete

Implementation issues:

- [#2 Baseline](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/2)
- [#3 Household isolation](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/3)
- [#4 Plaid webhook and jobs](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/4)
- [#5 Plaid Item lifecycle](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/5)
- [#6 Financial account model](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/6)
- [#7 Manual accounts and valuations](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/7)
- [#8 Movement read model](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/8)
- [#9 Transfer review](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/9)
- [#10 Category review](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/10)
- [#11 Budget calculations](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/11)
- [#12 Budget 3a experience](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/12)
- [#13 Accounts experience](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/13)
- [#14 Categories maintenance](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/14)
- [#15 Home dashboard](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/15)
- [#16 Accessibility and motion](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/16)
- [#17 Railway operations](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/17)
- [#18 Restore and release audit](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/18)

## Context handoff protocol

At the beginning of every context:

1. Read `CLAUDE.md` and this file.
2. Inspect `git status`, recent commits, and the current GitLab issue.
3. Verify the current phase’s assumptions against the working tree.
4. Work on one independently testable vertical slice.

At the end of every context:

1. Update checkboxes and the status block in this file.
2. Record decisions, risks, and authoritative verification evidence.
3. Set the exact next action below.
4. Update the corresponding GitLab issue.
5. Commit and push only to GitLab.
6. Confirm the GitLab-to-GitHub server-side mirror when deployment-relevant.

## Decision log

- 2026-09-19: private-household v1 is the primary finish line.
- 2026-09-19: v1 includes a full balance sheet with manual property and other
  assets/debts alongside Plaid.
- 2026-09-19: repository plan plus GitLab backlog is the durable coordination
  model.
- 2026-09-19: finance mutation isolation tests invoke the exported Next.js
  Route Handler and Server Action boundaries against PostgreSQL fixtures; a
  helper-only authorization assertion is not sufficient.
- 2026-09-19: foreign identifiers continue to return 404 where the scoped
  lookup intentionally prevents resource enumeration. The Plaid exchange
  boundary returns 403 for a Plaid Item ID learned from Plaid because the
  local owner cannot be determined before Plaid returns that ID.
- 2026-09-19: the finance-boundary inventory guard covers mutation methods in
  the Plaid, transfer, transaction, and budget API groups plus feature Server
  Actions. The test proves an omitted route is reported. Plaid Link-token
  creation is classified as non-mutating, the external webhook remains issue
  #4 work, and passkey-only endpoints are outside household-finance scope.

## Verification log

- 2026-09-19: GitLab CLI authentication confirmed for `piaanderson`.
- 2026-09-19: created and verified one milestone, one issue board with four
  workflow columns, 30 scoped labels, one coordinating issue, and 17
  implementation issues.
- 2026-09-19: reconciled `next-env.d.ts` as generated output: Next.js 16.3.5
  explicitly says not to track it, so it is ignored and `npm run typecheck`
  now runs `next typegen` before `tsc`.
- 2026-09-19: changed the clean-clone setup to `npm ci`; `npm install` under
  the documented Node 22/npm 10 combination rewrote lockfile peer metadata,
  while `npm ci` left `package-lock.json` unchanged.

### Issue #2 baseline evidence — 2026-09-19

Local environment: Node 22.23.2, npm 10.9.8, Docker 29.4.0, Docker Compose
5.1.2, PostgreSQL client 18.3, and PostgreSQL 17 from `compose.yaml`.

- `npm ci` — passed; 495 packages installed and generated files stayed clean.
- `docker compose up -d --wait && docker compose ps` — passed; the
  `postgres:17-alpine` container reported healthy on port 5432.
- `npm run db:migrate && npm run db:seed` — passed; Prisma reported no pending
  schema changes and the idempotent seed completed.
- `npx prisma validate && npx prisma migrate status && npm run db:deploy` —
  passed; the schema is valid, all three migrations are applied, and deploy
  found no pending migrations.
- `npm run typecheck` — passed after generating route types.
- `npm run lint` — passed with no findings.
- `npm test` — passed: 6 files and 16 tests.
- `npm run format:check` — passed.
- `npm run build` — passed with Next.js 16.3.5; static generation completed
  20/20 tasks.
- `npx playwright install chromium && npm run test:e2e` — passed on desktop
  and mobile: 7 passed and the mobile duplicate of the Chromium-CDP-only
  passkey test was explicitly skipped.
- `npm audit --omit=dev --json` — zero production dependency
  vulnerabilities. `npm ci` reports two moderate development-only findings.
- `npm run dev` was verified through an already-running checkout instance at
  `http://localhost:3001`; `GET /api/health` returned `{"status":"ok"}` and
  `/sign-in` returned HTTP 200. A second server correctly refused to coexist
  with that checkout's active Next.js development server.
- `npm run worker` — started cleanly and completed the three existing Plaid
  Sandbox jobs. The jobs synchronized 13–14 accounts and 390 added
  transactions each; the safe post-run summary showed 3 active Items,
  3 completed jobs, and no failed jobs. No access token, account name, or
  transaction payload was printed.
- GitLab
  [pipeline #7](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864527381)
  passed on commit `588dbddd` in 113 seconds: schema validation, typecheck,
  lint, 16 unit tests, production build, all migrations, seed, and 4 Chromium
  Playwright tests.
- `curl https://web-production-5ec4a.up.railway.app/api/health` — returned
  `{"status":"ok"}`. Railway reported successful running deployments for web,
  worker, and PostgreSQL; the cron's latest run exited successfully and its
  next run was scheduled for `2026-09-20T06:17:00Z`; the PostgreSQL volume was
  ready at 212.46 MB of 500 MB.
- `npx --yes @railway/cli@5.57.12 metrics --all --since 1h --json` — web had
  5 successful requests, zero 4xx/5xx responses, and zero error rate; web,
  worker, and PostgreSQL had low CPU and memory utilization.
- `npx --yes @railway/cli@5.57.12 config plan --json` initially exposed four
  destructive deletions for Plaid credentials. After adding
  `preserve()` declarations for both credentials on web and worker, the plan
  passed with zero changes and zero diagnostics.

Remaining risks:

- The parallel development browser run logs Plaid's warning that
  `link-initialize.js` was embedded more than once. It did not affect the
  passing tests or Sandbox worker sync, but the Link lifecycle should be
  resolved with issues #4–#5 rather than ignored before production use.
- This baseline reused three existing Sandbox Items and proved account and
  transaction synchronization through the real worker. A brand-new Link
  connection, signed webhook delivery, update mode, and failure recovery
  remain explicit Phase 1 work in issues #4–#5.
- `npm ci` reports two moderate development-only advisories; the production
  dependency audit is clean. Avoid `npm audit fix --force` because it proposes
  breaking upgrades.

### Issue #3 household-isolation evidence — 2026-09-19

Implementation:

- Added unique, self-cleaning PostgreSQL fixtures for two users, two
  households, and household-owned Plaid Items, accounts, transactions,
  transfer matches, categories, budget months, and allocations. Cleanup
  deletes only the two generated household and user IDs; it never truncates or
  resets the database.
- Exercised public-token exchange, manual Item sync, Item disconnect, transfer
  tie/untie, category assignment, merchant-rule creation, budget allocation
  updates, destination-account assignment, and category creation through the
  actual exported Route Handler or Server Action.
- Verified foreign identifiers return 404 without mutation for scoped resource
  routes. Existing-Plaid-Item exchange returns 403 without upsert or sync-job
  creation after the one mocked exchange needed to learn Plaid's Item ID.
- Mocked the Plaid client module in-process. Foreign manual sync and disconnect
  assert that neither mocked Plaid operation runs; no test has real Plaid
  credentials or an external-network code path.
- Added `test:unit` and `test:integration` commands. GitLab CI now applies
  migrations before `npm test` against its PostgreSQL service and runs the
  formatting check.
- Added a durable boundary inventory in the integration suite. A synthetic
  omitted-route test proves the guard reports a new unclassified mutation;
  `docs/SECURITY.md` requires boundary-level negative coverage.

Verification:

- `docker compose up -d --wait && npm run db:deploy` — passed; PostgreSQL 17
  was healthy and all three migrations were already applied.
- `npx vitest run tests/integration/finance-household-isolation.test.ts` —
  passed: 1 file and 13 tests.
- `npm run typecheck && npm run lint && npm run test:unit && npm run
test:integration && npm run format:check` — passed: generated route types,
  zero lint findings, 6 unit files/16 unit tests, 1 integration file/13
  integration tests, and all files formatted.
- `npm test && npm run build` — passed: 7 files/29 tests and the Next.js 16.3.5
  production build completed all 20 static-generation tasks.
- `git diff --check` and edited-file IDE diagnostics — passed with no findings.
- GitLab
  [pipeline #9](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864561539)
  passed commit `09b998b` in 122 seconds, including PostgreSQL migrations,
  all 29 Vitest tests without Plaid credentials or network calls, typecheck,
  lint, formatting, production build, seed, and Chromium browser tests.
- GitLab's enabled server-side mirror reported a successful update with no
  error, and GitHub `main` resolved to mirrored commit
  [`09b998b`](https://github.com/Piaanderson/Anderson-finance-app/commit/09b998b828ac20f04163c0f62502005a596b373a).

Remaining risks:

- Public-token exchange must call Plaid before it can compare an existing
  Plaid Item's stable Plaid ID with local ownership; that ID is not present in
  the client request. The test proves the required call is mocked and that
  rejection precedes every local write and sync enqueue. Every boundary that
  receives a local foreign resource ID rejects it before a Plaid call.

## Next handoff

Begin issue #4: harden Plaid webhook verification, synchronization pagination,
job deduplication, retry/rerun behavior, interrupted-worker recovery, and
transaction bounds. Keep roadmap issue #1 and the full Currents goal open; the
private v1 application is not complete.
