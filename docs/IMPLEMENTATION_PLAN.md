# Currents implementation plan

Last updated: 2026-09-21

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
  [#10 Build category assignment and merchant-rule review](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/10).

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

- [x] Test valid and invalid webhook signatures, stale timestamps, and body
      hashes.
- [x] Test sync cursor pagination and added, modified, and removed
      transactions.
- [x] Test job deduplication, retry, rerun, and interrupted-worker recovery.
- [x] Add negative cross-household tests for every mutating finance endpoint.
- [x] Bound transaction sizes for large initial syncs.
- [x] Normalize Plaid errors into actionable Item states.
- [x] Add update mode for `LOGIN_REQUIRED`.
- [x] Add account refresh, reconnect, disconnect, last-sync, and status
      controls.
- [x] Surface failed or stale syncs without logging private financial data.

Exit evidence:

- connect, disconnect, reconnect, webhook, manual sync, and reconciliation pass
- retries produce no duplicate transactions
- every mutation rejects another household’s identifiers
- logs contain no access tokens or transaction payloads

## Phase 2 — Full balance-sheet domain

Goal: support Plaid and manual financial positions through one honest model.

- [x] Add account-source and financial-classification enums.
- [x] Generalize financial accounts so manual records do not require Plaid IDs.
- [x] Define and test one balance-sign convention.
- [x] Add account balance and manual valuation snapshots.
- [x] Add manual property, investment, cash, and debt CRUD.
- [x] Pair property with related debt without combining their source records.
- [x] Make budget destination accounts explicit relations.
- [ ] Replace free-text category sections with an enum or validated domain type.
- [x] Migrate and backfill existing data without breaking Plaid sync.

Exit evidence:

- existing Plaid data survives migration
- a manual home and related mortgage can be represented
- net worth reconciles across all four financial groups
- historical trend data comes from snapshots rather than reconstructed fiction

## Phase 3 — Transactions and movement review

Goal: implement the approved Transactions 2a workflow.

- [x] Build a household-scoped movement read model.
- [x] Present a matched transfer once while retaining both source transactions.
- [x] Generate conservative transfer suggestions; never silently accept
      ambiguity.
- [x] Build unmatched-leg, tie, and untie interactions.
- [x] Store and show useful bank-provided description fields without raw
      payloads.
- [x] Build expandable, structured transfer details.
- [x] Build the transfers-first/category-second review stack.
- [ ] Build an accessible grouped category picker and merchant-rule option.
- [x] Add focus management and live announcements; show visible hints if a
      future review shortcut is added.

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
- 2026-09-19: Plaid transaction synchronization commits at most one
  100-update page at a time. `PlaidItem.syncCursor` remains the last fully
  completed cursor, while the claimed `SyncJob` stores the original cursor and
  current page checkpoint atomically with each page. Interrupted work resumes
  from its checkpoint; Plaid's documented mutation-during-pagination error
  resets to the preserved original cursor and safely replays idempotent
  writes.
- 2026-09-19: webhook verification uses Plaid's documented ES256 algorithm,
  fetched JWK, five-minute `maxTokenAge`, and raw-body SHA-256 requirements.
  No issuer, audience, or other undocumented claims are required.
- 2026-09-19: Plaid and worker failures are reduced to an allowlisted Plaid
  error code plus generic text before logging or persistence. Raw external
  messages and payloads are never logged or stored in `SyncJob.lastError`.
- 2026-09-21: position history starts with a real Plaid synchronization or
  manual valuation. The migration does not backfill snapshots because legacy
  balance as-of timestamps are unknown. Exact retries deduplicate, unchanged
  Plaid observations do not create noise, and a real value change always
  appends an observation.
- 2026-09-21: manual dates are date-only user input stored at noon UTC. A
  backdated observation is retained while the account's current position
  remains the latest effective observation, with ties resolved by observation
  time.
- 2026-09-21: active signed positions are centralized into currency-separated
  household totals. Unknown balances or currencies make a total partial; no
  implicit FX conversion or USD assumption is allowed.
- 2026-09-21: property and debt stay as separate account records. A
  household-scoped link enables derived equity only when all linked positions
  are known in one currency. Manual archive is soft and preserves snapshots.
- 2026-09-21: movements remain a read-time abstraction rather than a second
  ledger. Unmatched IDs derive from one transaction ID; transfer IDs derive
  from the ordered outgoing and incoming source IDs, so tie never rewrites a
  source leg and untie restores two independent movements.
- 2026-09-21: the outgoing leg owns a transfer's canonical date and description
  priority. Its authorized date wins over its posted date; description priority
  is outgoing merchant, bank description, then Plaid name before the same
  incoming fallbacks. Expanded detail retains every source value.
- 2026-09-21: movement arithmetic uses fixed minor units and separates ISO,
  unofficial, and unknown currency identities. Transfers contribute zero to
  income, spending, and category spending even when their leg currencies or
  values differ.
- 2026-09-21: removed transaction rows do not appear. Valid transactions from
  inactive accounts remain as honest history. Current balances and snapshots
  are not transaction-aligned, so the transfer UI reports balance movement as
  unavailable instead of reconstructing it.
- 2026-09-21: transfer suggestions require posted, unmatched, non-removed legs
  on distinct household accounts with opposite Plaid signs, exactly equal
  integer minor-unit amounts, one identical known currency identity, and
  effective dates within seven calendar days inclusive. Effective date is
  authorized date with posted fallback.
- 2026-09-21: date proximity ranks transfer candidates before limited
  transfer-description evidence. A top-two score distance of ten or less is
  explicitly ambiguous. Every suggestion requires confirmation; skip is
  session-only review state and does not mutate financial records.
- 2026-09-21: transfer confirmation revalidates the complete suggestion policy
  inside a Read Committed transaction. Sign-specific unique constraints
  arbitrate competing confirmations, and duplicate or racing writes return the
  stable `TRANSFER_MATCH_CONFLICT` 409 response. An explicit replacement tie
  may delete an orphaned match whose other source leg was removed.

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

- This baseline reused three existing Sandbox Items and proved account and
  transaction synchronization through the real worker. A brand-new Link
  connection and signed webhook delivery remain staging checks before
  production use. Issue #5 resolved the duplicate Link-script warning with a
  single, lazy page-level Link controller.
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

### Issue #4 Plaid reliability evidence — 2026-09-19

Implementation:

- Generated ES256 test keys exercise valid webhook signatures plus missing
  headers, malformed JWTs, wrong algorithms, unknown key IDs, bad signatures,
  body-hash mismatches, missing claims, stale timestamps, and future-issued
  tokens. Verification-key retrieval is mocked and the cache is proven to
  fetch once without logging key material.
- Validly signed malformed JSON returns 400. Unknown Items and irrelevant
  events return 204 without writes; duplicate work is absorbed by the
  one-row-per-Item queue.
- Account writes use bounded chunks and transaction changes use 100-update
  pages. Each page and its job checkpoint commit atomically; the stable Item
  cursor advances only with the final page. Page replay preserves user
  categories unless an explicit normalized merchant rule applies.
- Queue tests cover pending, running, completed, and failed deduplication,
  rerun requests during active work, concurrent claims, exponential retry,
  eight-attempt terminal failure, and stale-lock recovery. Page commits renew
  the worker lock.
- `src/worker.ts` now exposes one finite claimed-job processor and starts its
  polling loop only when executed as the entry point. SIGTERM and SIGINT still
  request graceful shutdown after current work.
- Webhook and sync suites replace the Plaid client module with in-process
  mocks. Unique PostgreSQL fixtures delete only their generated household and
  user IDs; no test truncates, resets, or wipes the database.
- Plaid error sanitization tests inject an access token, account name,
  transaction name, raw webhook-like body, and complete payload into an
  external error, then prove none reaches structured logs or persisted job
  errors.

Verification:

- `npx vitest run src/server/plaid/webhooks.test.ts` — passed: 1 file and 13
  tests.
- `npx vitest run tests/integration/plaid-sync.test.ts` — passed: 1 file and 3
  tests.
- `npx vitest run tests/integration/plaid-jobs-worker.test.ts` — passed: 1
  file and 5 tests.
- `npm run test:unit` — passed after quoting the exclusion glob so it actually
  excludes integration files: 7 files and 29 tests.
- `npm run test:integration` — passed: 3 files and 21 tests.
- `npm test` — passed: 10 files and 50 tests.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` — passed
  with no findings.
- `npm run build` — passed with Next.js 16.3.5; all 20 static-generation tasks
  completed.
- `npx prisma validate`, `npm run db:deploy`, and
  `npx prisma migrate status` — passed; the four-migration schema is valid and
  current.
- `git diff --check` and edited-file IDE diagnostics — passed with no
  findings.
- GitLab
  [pipeline #11](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864599725)
  passed commit `e8dc17a` in 126 seconds, including PostgreSQL migrations,
  all 50 Vitest tests without Plaid credentials or network calls, typecheck,
  lint, formatting, production build, seed, and Chromium browser tests.
- GitLab's enabled server-side mirror finished successfully with no error, and
  GitHub `main` resolved to mirrored commit
  [`e8dc17a`](https://github.com/Piaanderson/Anderson-finance-app/commit/e8dc17ae7f45bca7e4be5b4d625f3066c8d1ec37).

Remaining risks:

- All automated tests intentionally use generated keys, mocked Plaid methods,
  and local PostgreSQL. Trial-environment institution behavior and signed
  webhook delivery still require the staging work planned before production.

### Issue #5 Plaid Item lifecycle evidence — 2026-09-19

Implementation:

- Plaid failures now become explicit Item states. `ITEM_LOGIN_REQUIRED` stops
  retrying immediately and requests reconnect; an eighth failed attempt marks
  the Item `ERROR`. Successful sync and `LOGIN_REPAIRED` clear the stored safe
  error code and restore `ACTIVE`.
- Item `ERROR`, `PENDING_EXPIRATION`, and `PENDING_DISCONNECT` webhooks are
  normalized without storing display messages or unchecked external strings.
  Only allowlisted Plaid error-code characters can reach the database or logs.
- `/api/plaid/link-token` accepts an optional local Item ID, derives its
  household from the authenticated membership, decrypts the existing access
  token only on the server, and follows Plaid update mode by omitting new-Item
  products. A foreign or removed Item returns 404 before a Plaid call.
- Connect and reconnect share one lazy page-level Plaid Link controller. New
  connections still exchange a public token; update mode never exchanges one
  because the existing access token remains valid. The Link script is not
  loaded until the user starts a Link flow.
- The Accounts page shows exact last-sync time, first-sync and over-24-hour
  stale states, queued/running retry state, active account counts, and distinct
  recovery copy. `LOGIN_REQUIRED` offers Reconnect; terminal failure offers
  Try sync again. Every connection can be disconnected.
- Refresh enqueues the existing idempotent job. Disconnect calls Plaid
  `/item/remove`, then atomically clears encrypted token material, marks the
  Item removed, deactivates only its household-owned accounts, and terminates
  queued/running jobs. Account chunks now verify the active Item and worker
  claim so a concurrent disconnect cannot reactivate accounts.
- Controls are native labelled buttons with 44px targets and visible focus.
  Context is associated with each control, status updates use a polite live
  region, failures use `role="alert"`, and the destructive disconnect action
  requires confirmation. Desktop and mobile WCAG 2.1 AA scans pass.
- Unique, self-cleaning lifecycle fixtures mock Link-token creation and Item
  removal, prove create versus update mode, foreign-Item rejection, manual
  refresh, disconnect cleanup, safe failure behavior, and absence of access
  tokens/account names in logs. Worker and webhook tests prove the two
  recovery states.

Verification:

- `npx vitest run src/features/accounts/connection-status.test.ts
src/server/plaid/webhooks.test.ts` — passed: 2 files and 23 tests.
- `npx vitest run tests/integration/plaid-item-lifecycle.test.ts
tests/integration/plaid-jobs-worker.test.ts
tests/integration/plaid-sync.test.ts` — passed: 3 files and 16 tests.
- `npx playwright test tests/e2e/accessibility.spec.ts --grep 'account
recovery controls'` — passed on desktop and mobile: 2 tests.
- `npm run test:unit` — passed: 8 files and 39 tests.
- `npm run test:integration` — passed: 4 files and 29 tests.
- `npm test` — passed: 12 files and 68 tests.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` — passed
  with no findings.
- `npm run build` — passed with Next.js 16.3.5; all 20 static-generation tasks
  completed.
- `npm run test:e2e` — passed on desktop and mobile: 9 passed and the mobile
  duplicate of the Chromium-CDP-only passkey test was explicitly skipped.
  The prior duplicate Plaid Link script warning did not recur.
- `git diff --check` and edited-file IDE diagnostics — passed with no
  findings.
- Every Vitest Plaid method is an in-process mock. The lifecycle browser test
  intercepts its local Item actions and never opens Link; no acceptance test
  sends a request to Plaid.
- GitLab pipeline
  [#13](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864630128)
  exposed a clock-dependent stale-lock fixture after the fixed test timestamp
  fell behind the job's real `runAfter`. Replacing it with a future-relative
  time passed five consecutive targeted runs and the complete 68-test suite.
- GitLab pipeline
  [#14](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864631840)
  passed commit `d75d0d3`, including schema validation, migrations, all 68
  tests, typecheck, lint, formatting, production build, seed, and Chromium
  browser tests.
- GitLab's enabled server-side mirror completed without error, and GitHub
  `main` resolved to mirrored commit
  [`d75d0d3`](https://github.com/Piaanderson/Anderson-finance-app/commit/d75d0d373edbfd60e0a7b6021558136a668cefc6).

Remaining risks:

- Real institution reauthentication, OAuth redirects, expiring consent, and
  signed `LOGIN_REPAIRED` delivery still require Trial/staging verification.
  Local and CI tests deliberately use mocked Plaid methods and local
  PostgreSQL.
- Disconnect preserves existing transactions for historical reporting while
  deactivating accounts. The generalized model now keeps their `PLAID` source
  identity but excludes inactive rows from current account and net-worth
  reads. Issue #7 starts sourced snapshots; issue #13 still owns how a later
  chart represents connection removal without implying an invented balance.

### Issue #6 financial account model evidence — 2026-09-19

Implementation:

- Added required `AccountSource` and `FinancialAccountClassification` enums.
  The database enforces all-or-nothing provider identity: Plaid accounts keep
  Item, account, and raw type identifiers; manual accounts cannot store Plaid
  identifiers.
- Added Cash, Invested, Property, Debt, and an honest `UNCLASSIFIED` fallback
  for provider types that cannot be mapped safely. Manual records can represent
  all four household groups without a Plaid Item.
- Defined `currentBalance` as the signed net-worth position. Plaid credit and
  loan amounts owed are negated exactly once; asset overdrafts and liability
  overpayments retain their economic sign. `availableBalance` remains raw
  provider availability and is excluded from net worth. The rule is documented
  in `docs/ACCOUNT_MODEL.md`.
- Updated Plaid account ingestion, account reads, the authenticated shell, and
  Home net-worth arithmetic to use the signed position directly. Manual
  accounts now appear without requiring a bank connection.
- Added `BudgetAllocation.destinationAccount` as an explicit optional relation,
  indexed its foreign key, used it in budget reads, and set deletion behavior
  to clear the destination without deleting the allocation.
- The migration backfills every legacy row as `PLAID`, maps the four existing
  provider types deterministically, and converts debt signs in place. Applying
  it locally preserved all 41 accounts and all provider identifiers: 18 Cash,
  6 Invested, and 17 Debt, with zero missing Plaid IDs.
- Added a transactional legacy-schema migration test. It applies the four prior
  migrations in an isolated PostgreSQL schema, inserts representative cash,
  investment, credit, and loan rows, applies the new migration, verifies
  identity and exact signed balances, and rolls back the entire fixture.
- Added self-cleaning integration coverage for four-class manual positions,
  database source constraints, direct net-worth reconciliation, manual-account
  overview reads, and destination relation cleanup. Plaid sync coverage proves
  liability normalization while retaining raw available credit.

Verification:

- Targeted account-model, migration, Plaid sync, lifecycle, and household
  boundary run — 5 files and 36 tests passed.
- `npm run test:unit` — 9 files and 47 tests passed.
- `npm run test:integration` — 5 files and 34 tests passed.
- `npm test` — 14 files and 81 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx prisma validate`, `git diff --check`, and edited-file IDE diagnostics —
  passed with no errors.
- `npm run build` — passed on Next.js 16.3.5 with all application and API routes
  compiled.
- `npm run test:e2e` — 9 Chromium/mobile tests passed and the mobile passkey
  hardware case was skipped as expected. Accounts recovery remained
  keyboard-operable and free of automatically detectable WCAG violations.
- GitLab pipeline
  [#16](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864682079)
  passed commit `ce68ba4`, including schema validation, all five migrations,
  81 tests, typecheck, lint, formatting, production build, seed, and Chromium
  browser tests.
- GitLab pipeline
  [#17](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2864690864)
  exposed one remaining fixed-time retry fixture after real time passed its
  synthetic `runAfter`. Replacing it with a future-relative time passed five
  consecutive targeted runs and the complete 81-test suite.
- GitLab's enabled server-side mirror completed without error, and GitHub
  `main` resolved to mirrored commit
  [`ce68ba4`](https://github.com/Piaanderson/Anderson-finance-app/commit/ce68ba4fff25135f033b283ba93379b75c4b9a39).

Remaining risks:

- Pre-issue-#7 account balances intentionally remain snapshotless because the
  migration cannot know their true observation time. They enter history only
  after a real sync or manual valuation.
- A future Plaid provider type outside depository, investment, credit, and loan
  is stored as `UNCLASSIFIED` rather than guessed. Phase 5 account maintenance
  must provide a household-visible remediation path before such an account can
  be grouped.

### Issue #7 manual accounts and valuations evidence — 2026-09-21

Implementation:

- Added append-safe `AccountPositionSnapshot` observations for both Plaid sync
  and manual valuations. Current signed position and snapshot commit in one
  transaction; exact retries and unchanged Plaid reads deduplicate while real
  value changes append.
- Added household-scoped manual Cash, Invested, Property, and Debt create,
  read, edit, and soft-archive Server Actions. Manual accounts require a known
  balance and recognized ISO currency, cannot be `UNCLASSIFIED`, and never
  carry Plaid identifiers.
- Debt forms say “Amount owed” and accept a positive number; the server stores
  the signed negative position exactly once. Backdated valuations remain in
  history without replacing a newer effective current value.
- Added validated `PropertyDebtLink` records. Property and debt remain separate
  sources, while Accounts shows a minimal same-currency derived equity view.
- Centralized current household arithmetic for Accounts, the authenticated
  shell, and Home. Active positions reconcile across Cash, Invested, Property,
  and Debt; unlike currencies stay separate and missing data is explicit.
- Added snapshot-observation queries for the later labelled eight-month view.
  They return actual observations only and never synthesize missing months.
- Extended the issue #3 mutation inventory with all five account Server
  Actions and two-household negative tests for accounts, snapshots, and links.
- Used the bundled Next.js 16.3.5 Forms, Server Actions, and `revalidatePath`
  guidance. Every action authenticates independently, validates `FormData`,
  and derives the household from membership.

Verification:

- Targeted account model/calculation tests — 3 files and 13 tests passed.
- Targeted manual-account, migration, Plaid snapshot, and household-boundary
  integration tests — 4 files and 33 tests passed.
- Focused desktop/mobile Playwright manual-account flow — 2 tests passed,
  including labels, associated server errors, keyboard focus, 44px target,
  live announcements, linking, archive confirmation, axe WCAG 2.1 AA scans,
  and an assertion of zero Plaid-host requests.
- `npm run test:unit` — 11 files and 52 tests passed.
- `npm run test:integration` — 6 files and 46 tests passed.
- `npm test` — 17 files and 98 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx prisma validate`, `npx prisma migrate status`, `npm run build`,
  `git diff --check`, and edited-file IDE diagnostics — passed. Prisma reports
  all six migrations applied.
- `npm run test:e2e` — 11 desktop/mobile tests passed; the mobile duplicate of
  the Chromium-only passkey test was skipped as expected.
- Plaid acceptance paths remain network-free: Vitest replaces the client with
  in-process mocks, and the browser flow records and rejects any Plaid-host
  request.
- GitLab
  [pipeline #19](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2869202284)
  passed commit `b391924` in 2 minutes 51 seconds, including all six
  migrations, 98 Vitest tests, typecheck, lint, formatting, production build,
  seed, and Chromium browser coverage.
- GitLab's enabled server-side mirror reported `finished`, a successful update
  at `2026-09-21T21:20:11.317Z`, and no error after the implementation push.

Remaining risks:

- No pre-migration snapshot history is fabricated. Existing Plaid accounts
  begin trend history on their next synchronization.
- Exchange rates are intentionally out of scope. Multi-currency households
  show separate totals until a future explicit FX policy is designed.
- The complete grouped/expandable Accounts design and chart presentation remain
  in issues #13 and #15. This slice includes only the maintenance forms and
  minimal property/equity pairing required for an honest balance sheet.
- Real institution balance timing still requires Trial/staging verification;
  local and CI Plaid calls are mocked by design.

### Issue #8 household movement evidence — 2026-09-21

Implementation:

- Added a server-only household movement data-access layer over source
  transactions and transfer matches. Deterministic movement identity, canonical
  date/description selection, pending state, direction, ordering, category
  history, removed-row behavior, and inactive-account history are documented in
  `docs/MOVEMENT_MODEL.md`.
- Matched transfers render once and retain both transaction IDs and both
  accounts, amounts, authorized/posted dates, bank/Plaid descriptions,
  merchants, memo/reason, references, payment channels, transaction codes, and
  check numbers. Untie still returns the legs to independent rows.
- Plaid sync now requests original descriptions and stores only normalized
  fields. Raw responses are neither stored nor exposed. The additive migration
  preserves existing rows and installs composite foreign keys that prevent a
  cross-household transfer match.
- Central fixed-point movement arithmetic now powers Home income/spending and
  Budget category-spending status. Transfers are excluded, pending movements
  remain explicit, and unlike ISO, unofficial, or unknown currencies stay in
  separate totals.
- The Transactions page follows approved direction 2a with one-row transfers,
  a native button disclosure, explicit `aria-expanded`/`aria-controls`,
  two-leg mobile detail, visible focus, 44px targets, text status, and existing
  reduced-motion behavior. Balance movement is explicitly unavailable because
  current positions and snapshots are not transaction-aligned.
- Added unique two-household fixtures proving foreign transactions, accounts,
  matches, and expanded metadata cannot be read or combined. Existing transfer
  Route Handlers are unchanged, so the issue #3 mutation inventory did not add
  a boundary; its integration suite now also proves tie/untie/retie
  reversibility against the movement read.

Verification:

- Targeted movement, Plaid normalization, migration, household-read, and
  mutation-boundary run — 4 files and 36 tests passed.
- Focused movement Playwright run — desktop and mobile passed, including
  one-row counting, Enter-key expansion, focus, names/states, 44px target,
  responsive two-leg layout, WCAG 2.1 AA axe scans, and zero observed
  Plaid-host requests.
- `npm run test:unit` — 12 files and 59 tests passed.
- `npm run test:integration` — 7 files and 51 tests passed.
- `npm test` — 19 files and 110 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx prisma validate`, `npx prisma migrate status`, `npm run build`,
  `git diff --check`, and edited-file IDE diagnostics passed. Prisma reports
  all seven migrations applied.
- `npm run test:e2e` — 13 desktop/mobile tests passed and the mobile duplicate
  of the Chromium-only passkey case was skipped as expected.
- Acceptance coverage is network-free: Plaid synchronization tests replace the
  client with in-process mocks, and movement browser coverage records and
  rejects any Plaid-host request.

Remaining risks:

- The private-household read currently constructs owned history before applying
  query and the 100-row UI limit. This keeps both transfer legs correct for
  search and date selection, but database-level movement pagination should be
  added if household history grows beyond private-v1 scale.
- Existing transactions have no bank description/payment metadata until Plaid
  sends them in a later added or modified update; the migration does not
  fabricate those values.
- Income remains the documented sign-based unmatched inflow total. Refund and
  category-specific income semantics belong to category/budget work in issues
  #10–#11.
- Suggestions, automatic candidate ranking, and the complete transfers-first
  tie/untie review experience remain issue #9. Category review remains issue
  #10.

### Issue #9 transfer-review evidence — 2026-09-21

Implementation:

- Added a pure deterministic suggestion policy and a household-scoped
  data-access layer. Candidate construction indexes incoming legs by currency
  identity and integer minor-unit amount before applying the inclusive
  seven-calendar-day window; it never performs a naïve all-to-all comparison.
- Suggestions exclude pending, removed, already matched, same-account,
  wrong-sign, unequal-amount, incompatible-currency, unknown-currency, and
  out-of-window pairs. Authorized date wins over posted date. Transfer wording
  only supports ranking and never creates eligibility.
- Ranked candidates carry plain amount, account, date-distance, and optional
  description reasons. Similar top candidates are explicitly ambiguous, and
  every candidate is confirmation-required. No code path creates a match from
  suggestion generation.
- Strengthened `POST /api/transfers` to apply the same policy in the database
  transaction. Foreign IDs remain 404, policy failures are 422, and duplicate
  or concurrent ties are stable 409 conflicts. A remaining live leg can be
  reviewed again when its stale match points to a removed counterpart.
- Tie and untie mutate only `TransferMatch`. Full source `Transaction` rows are
  byte-for-byte equal before tie, after tie, and after untie in integration
  coverage; retie succeeds.
- Replaced the hardcoded transfer count with the approved 2a transfers-first
  queue. The unmatched-leg tray, candidate reasons, ambiguity choices,
  two-leg inspection, skip, confirm, one-row ledger result, and plain “Wrong
  match? Untie” action are native, keyboard-operable controls.
- Tie, skip, and untie move focus to the next meaningful control or restored
  source movement. Queue and success updates use a polite live region;
  blocking failures use `role="alert"`. Transfer and category panels hide
  independently at zero, and desktop/mobile layouts retain 44px targets,
  visible focus, text status, reduced motion, and WCAG 2.1 AA semantics.
- Followed the bundled Next.js 16.3.5 Route Handler, server/client boundary,
  and `router.refresh()` guidance. The authenticated Server Component reads
  Prisma directly; the client leaf calls the existing POST/DELETE boundaries
  and merges an optimistic view while the server payload refreshes.

Verification:

- Targeted suggestion policy — 1 file and 8 tests passed.
- Targeted transfer and issue #3 mutation-boundary integration — 2 files and
  31 tests passed.
- Focused desktop/mobile transfer-review Playwright flow — 2 tests passed,
  including transfer-first ordering, real counts, explanations, ambiguity-safe
  confirmation, Space/Enter actions, focus, live announcements, tie, untie,
  independent zero-queue hiding, responsive legs, 44px targets, and axe WCAG
  2.1 AA scans.
- `npm run test:unit` — 13 files and 67 tests passed.
- `npm run test:integration` — 8 files and 62 tests passed.
- `npm test` — 21 files and 129 tests passed.
- `npm run typecheck`, `npm run lint`, `npx prisma validate`,
  `npx prisma migrate status`, `npm run build`, `git diff --check`, and
  edited-file IDE diagnostics passed. Prisma reports all seven migrations
  applied.
- `npm run test:e2e` passed against the existing local development server: 13
  desktop/mobile tests passed and the mobile duplicate of the Chromium-only
  passkey case was skipped as expected.
- GitLab
  [pipeline #22](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2869427568)
  passed commit `1f385fe` in 2 minutes 34 seconds, including schema validation,
  all seven migrations, 129 Vitest tests, typecheck, lint, formatting,
  production build, seed, and Chromium browser coverage.
- GitLab's enabled server-side mirror reported `finished`, a successful update
  at `2026-09-21T23:20:41.030Z`, and no error after the implementation push.
- Browser fixtures record and reject every Plaid-host request; transfer unit
  and integration suites do not import or call the Plaid client.
- The exact repository-wide `npm run format:check` was run and reported only
  the protected, unrelated untracked
  `docs/MOBILE_RESPONSIVE_SKILL_FEEDBACK.md`. That file was not edited,
  deleted, staged, or committed. A scoped Prettier check over every issue #9
  file passed.

Remaining risks:

- Skipping a suggestion is intentionally session-only. A durable “not a pair”
  decision would need a new household-owned model and product semantics; it is
  not silently inferred from a skip.
- Suggestions inspect all unmatched private-household history but bucket
  candidates before comparison and cap the returned queue at 100. Database
  pagination or a durable review horizon should be added if history grows
  beyond private-v1 scale.
- Existing manually created or pre-policy `TransferMatch` rows remain visible
  as historical transfers until a user unties them. New and replacement ties
  cannot bypass the current policy.
- Category assignment and merchant-rule review remain issue #10; this slice
  supplies only the ordered, independently hiding category queue panel.

## Next handoff

Begin
[#10 Build category assignment and merchant-rule review](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/10).
Keep roadmap issue #1 and the full Currents goal open; the private v1
application is not complete.
