# Currents implementation plan

Last updated: 2026-10-02

## Current status

- Release target: secure, polished private-household v1
- Current phase: Phase 8 — Private production readiness — issue
  [#18](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/18)
  has a successful encrypted logical restore but remains blocked on Plaid
  Trial and real-institution recovery evidence. Issue
  [#17](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/17)
  is closed after its revised recovery scope, usage controls, pipeline #35,
  server-side mirror, and production deployment were verified.
- Roadmap issue:
  [#1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/1)
- Milestone:
  [Currents Private v1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/milestones/1)
- Board:
  [Currents Private v1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/boards/11624000)
- Canonical remote: GitLab; GitHub is a server-side deployment mirror only
- Current release-audit record:
  [`docs/PRIVATE_V1_RELEASE_AUDIT.md`](./PRIVATE_V1_RELEASE_AUDIT.md)

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
- [x] Replace free-text category sections with an enum or validated domain type.
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
- [x] Build an accessible grouped category picker and merchant-rule option.
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

- [x] Add dynamic month navigation and remove hardcoded scenario dates from
      logic.
- [x] Calculate income with a documented manual-adjustment path.
- [x] Add editable allocations with accessible validation.
- [x] Support copying the previous month into a new draft.
- [x] Implement the 2c header, allocation bar, “Where it goes,” and moved/due
      stats.
- [x] Implement paired planned-to-destination rows for every section.
- [x] Implement structured Flex rows with planned, spent, remaining, and over.
- [x] Exclude transfers from spending.
- [x] Connect savings and debt movements to destination accounts.
- [x] Show mortgage owed and home-value context in Needs.

Exit evidence:

- budget totals reconcile and left-to-budget responds to edits
- spending comes from categorized transactions
- transfers never inflate spending
- moved/due uses real movements
- month copy and edits survive reload

## Phase 5 — Accounts and Categories — complete

Goal: make balance-sheet and classification maintenance complete.

Accounts:

- [x] Build grouped Cash, Invested, Property, and Debt views with subtotals.
- [x] Expand rows for connection status, activity, projection, and actions.
- [x] Add manual-account and valuation editing.
- [x] Pair property and mortgage in the equity presentation.
- [x] Show labelled snapshot-based net-worth history when enough data exists.

Categories:

- [x] Rename, archive, restore, move, and reorder categories.
- [x] Provide keyboard controls for any pointer-based reordering.
- [x] Show and edit merchant rules.
- [x] Define safe behavior for allocations and transactions on archive or
      merge.

Exit evidence:

- account arithmetic reconciles to net worth
- manual and Plaid accounts behave consistently
- category maintenance preserves dependent records

## Phase 6 — Home dashboard — complete

Goal: provide a traceable summary using the integrated prototype and 4a-style
direction as the baseline.

- [x] Show net worth and monthly change.
- [x] Show month pacing, income, spending, saving, and debt paydown.
- [x] Add an explicit comparison basis.
- [x] Add spending-by-category, recent movements, budget status, upcoming
      obligations, and account rollup.
- [x] Use accessible charts with visible summaries and data fallbacks.

Exit evidence:

- every displayed number traces to a tested server-side calculation
- comparisons state their period and basis
- no production path depends on static scenario figures

## Phase 7 — Motion, responsive design, and accessibility — complete

Goal: complete the intended polish without sacrificing inclusive use.

- [x] Add restrained expansion, transfer, allocation, chart, and state-change
      motion.
- [x] Disable nonessential motion with `prefers-reduced-motion`.
- [x] Verify desktop, tablet, mobile, large-desktop, and practical 200% reflow
      layouts.
- [x] Keep all targets at least 44 by 44 CSS pixels.
- [x] Verify headings, landmarks, names, descriptions, live regions, form
      errors, focus order, disclosure state, contrast, and keyboard
      interaction.
- [x] Run automated WCAG checks and direct browser keyboard/visual inspection
      on every route.

Exit evidence:

- The route-by-route decisions, state coverage, responsive widths,
  direct-inspection method, motion decisions, and residual risks are recorded
  in [the Phase 7 audit](./ACCESSIBILITY_AUDIT.md).
- Axe WCAG 2.1 A/AA scans cover sign in, setup, Home, Budget, Accounts,
  Transactions, Categories, and Security in desktop Chromium and mobile
  projects.
- Browser checks cover 320, 375, 390, 412, 512, 768, 1024, 1280, 1440, and
  1920 CSS pixels, with 512 serving as the practical 1024-at-200%-zoom reflow
  check.
- Keyboard workflows cover the skip link, native disclosures, transfer
  tie/untie, grouped category assignment, category maintenance, budget editing,
  account recovery/maintenance, passkeys, and recovery codes.
- Validation errors, operation failures, unavailable data, pending work,
  successful updates, and stale-revision conflicts have labelled alerts or
  polite statuses as appropriate.
- All visible interactive targets pass the 44-by-44 CSS-pixel browser check;
  state includes text or structure and never relies on color alone.
- Reduced-motion browser checks prove that rendered animation and transition
  durations resolve to no more than 0.01ms.
- Browser request capture proves that acceptance tests make no Plaid-hosted
  requests.

Local verification on 2026-09-27:

- `npm run test:unit` — 17 files, 92 tests passed.
- `npm run test:integration` — 13 files, 91 tests passed.
- `npm test` — 30 files, 183 tests passed.
- `npm run typecheck` — Next route generation and TypeScript passed.
- `npm run lint` — passed with no findings.
- scoped `npx prettier --check` across every issue-owned file — passed.
- `npx prisma validate` — schema valid.
- `npx prisma migrate status` — eight migrations found; local schema up to
  date.
- `npm run build` — Next.js 16.3.5 production build and all 21 static pages
  passed.
- focused Phase 7 desktop/mobile audit — 6 tests passed; focused responsive
  screenshot pass — 2 tests passed.
- `npm run test:e2e` — 29 tests passed and the expected mobile duplicate of
  the Chromium-only passkey ceremony was skipped.
- direct rendered-image inspection covered 320, 375, 390, 412, 512, 768, 1024,
  1280, 1440, and 1920 CSS pixels; no clipping, horizontal page overflow,
  overlapping navigation, obscured end content, or unbounded large-screen
  stretching was found.
- edited-file IDE diagnostics — no errors.
- `git diff --check` — passed.

## Phase 8 — Private production readiness

Goal: make private v1 safe to use daily with real financial data.

- [x] Create and validate isolated staging before production Plaid access.
      Staging has its own PostgreSQL volume, Auth.js and encryption secrets,
      passkey origin, webhook URL, and Plaid Sandbox team.
- [x] Remove development bypass and bootstrap credentials from the current
      Railway production web service, and refuse them at runtime if they
      return.
- [x] Record the current production hostname and matching passkey origin.
      Do not change it without a credential migration.
- [ ] Complete Plaid Trial before Plaid Production.
- [x] Monitor worker health, sync lag, failed jobs, and login-required Items.
- [x] Implement encryption-key rotation and prove it against local fixtures
      and a disposable staging-only encrypted Item.
- [x] Configure Railway usage alerts and spending limits. The $15 alert and
      $40 hard limit are active.
- [x] Point-in-time recovery is enabled and advancing on production
      PostgreSQL. Under the owner-approved Hobby scope, encrypted portable
      logical backups replace Pro-only Daily + Weekly volume snapshots.
- [x] Complete and record a disposable-database restore drill.
- [x] Verify security headers and PII-scrubbed error reporting in application
      code and tests.
- [x] Complete the current-scope `docs/SECURITY.md` and `docs/RAILWAY.md`
      release checklists after staging, recovery, and usage limits exist.

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
- 2026-09-26: Accounts subtotals and net worth use exact Decimal arithmetic
  and retain one total per ISO currency. Property carries its full source value
  and linked mortgages remain in Debt; derived equity is context, not a
  replacement subtotal.
- 2026-09-26: an unclassified Plaid position remains visible in net worth as a
  review-needed adjustment. A household-scoped classification choice persists
  when later Plaid syncs still report an unknown type; a recognized provider
  type remains authoritative.
- 2026-09-26: the eight-month net-worth view emits points only at real
  `AccountPositionSnapshot` observation times after all currently active
  accounts have known positions in one currency. It never creates monthly
  points, interpolates, applies FX, or reconstructs history from transactions.
- 2026-09-27: category archive is a soft state that preserves transaction,
  budget-allocation, and merchant-rule references. Archived destinations pause
  exact rules and remain visible in historical budgets; restore reactivates the
  retained records.
- 2026-09-27: category merge is an explicit Serializable reclassification. It
  moves transaction and rule references, combines same-month Decimal plans,
  and rejects conflicting destination accounts rather than selecting one
  implicitly.
- 2026-09-27: merchant automation remains household-scoped exact normalized-key
  matching. Keys are visible and editable; duplicate, missing, stale, or
  archived-destination states never fall back to fuzzy behavior.

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
- Category assignment and merchant-rule review are completed in issue #10.
  Category maintenance beyond assignment remains in Phase 5.

### Issue #10 category-review evidence — 2026-09-21

Implementation:

- Replaced category-section free text at write boundaries with one validated
  Needs, Flex, Savings, and Debt domain shared by category creation, seed data,
  page rendering, and review ordering. Invalid legacy sections remain stored
  but are not offered for new assignments.
- Added a household-scoped category-review data read that returns only active
  categories and rules whose destination category remains active. Product
  ordering is deterministic by section, category sort order, name, and ID.
- Added the approved grouped searchable combobox/listbox to the second review
  panel. Arrow keys, Home, End, Enter, Escape, touch selection, explicit
  labels, selected state, and native assignment, skip, and rule controls are
  supported.
- Category assignment optimistically updates the ledger and queue count, then
  reconciles from the Server Component. Focus moves to the next category
  combobox or ledger, status changes use a polite live region, blocking errors
  use `role="alert"`, and the category panel disappears and announces
  completion at zero.
- Defined one shared exact merchant-key policy: merchant name with transaction
  name fallback, trim, Unicode NFKC normalization, whitespace collapse, and
  locale-stable lowercase. The UI shows the key and any existing rule before
  assignment.
- Strengthened the category Route Handler so a live household transaction can
  be assigned only to an active category in the same authenticated household.
  Assignment and optional rule upsert or deletion commit atomically; foreign,
  removed, and archived resources remain non-enumerating `404` responses.
- Plaid synchronization now uses the same merchant-key function and ignores
  rules whose destination category is archived. Existing manual categories
  remain unchanged unless an explicit active exact-match rule applies.

Verification:

- Targeted category-domain, category-boundary, and household-isolation suites
  — 3 files and 31 tests passed.
- Focused transfer/category desktop and mobile Playwright flows — 4 tests
  passed, including grouped keyboard behavior, touch-sized controls, rule
  removal and persistence, optimistic ledger/count updates, focus, live
  announcements, responsive overflow checks, no Plaid-host requests, and axe
  WCAG 2.1 AA scans with zero violations.
- `npm run test:e2e` — 15 desktop/mobile tests passed and the mobile duplicate
  of the Chromium-only passkey case was skipped as expected.
- `npm test` — 23 files and 140 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx prisma validate`, `npx prisma migrate status`, `npm run build`, and
  `git diff --check` passed. Prisma reports all seven migrations applied.

Remaining risks:

- Category skip is intentionally session-only. A durable ignored decision
  needs a separate household-owned model and product semantics.
- Rules deliberately use exact normalized merchant identity. Fuzzy or
  substring matching is excluded because it could silently miscategorize
  unrelated financial records.
- Review is bounded by the current 100-movement private-v1 ledger read.
  Database-level queue pagination or a durable review horizon should be added
  if household history grows materially.

### Issue #11 monthly-budget foundation evidence — 2026-09-21

Implementation:

- Replaced the hardcoded September/demo fallback with canonical `YYYY-MM`
  selection, UTC month boundaries, and native previous/next navigation. An
  invalid or absent month falls back to the current month.
- Added a pure fixed-point calculation domain. Income plans, allocations,
  category activity, transfer movement, left-to-budget, section totals,
  remaining, and over amounts use integer minor units rather than
  floating-point arithmetic.
- Documented and implemented the income policy: `BudgetMonth.income` remains
  the household's manual monthly plan, while unmatched uncategorized USD
  inflows show observed income. Uncategorized outflows and activity in
  categories without allocations are surfaced instead of disappearing.
- Needs and Flex use net categorized transaction activity, including
  categorized inflows as refunds. Debt and Savings use the incoming leg of
  matched USD transfers to explicit destination accounts. Transfers never
  inflate spending.
- Shared destination accounts consume one transfer pool in deterministic
  budget order, so one movement cannot be counted in multiple rows or
  sections.
- Wired the calculation result into the existing budget surface so dynamic
  month navigation, left-to-budget, allocation totals, and real moved/due
  values can be verified without implementing issue #12's approved 2a/2c
  visual treatment.
- Added a household-scoped previous-month copy Route Handler. It copies only
  into the immediately following absent month, preserves income and plans,
  omits archived categories, clears inactive/archived/foreign destinations,
  and returns stable missing-source and conflict responses. The database unique
  constraint arbitrates concurrent copies.
- Added `docs/BUDGET_MODEL.md` as the canonical calculation, currency,
  destination, and copy policy.

Verification:

- Targeted calculation, copy-boundary, and household-isolation suites — 3
  files and 30 tests passed.
- Focused desktop/mobile monthly-budget Playwright flow — 2 tests passed,
  including real income/spending/transfers, reconciled moved/due, dynamic
  navigation, keyboard copy, focus, live announcement, persistence, 44px
  targets, responsive overflow, no Plaid-host requests, and axe WCAG 2.1 AA
  scans with zero violations.
- Full desktop/mobile Playwright acceptance suite — 17 passed and 1
  platform-gated passkey test skipped.
- `npm test` — 25 files and 150 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx prisma validate`, `npx prisma migrate status`, `npm run build`, and
  `git diff --check` passed. Prisma reports all seven migrations applied.

Remaining risks:

- The budget plan is intentionally USD-only in private v1. Non-USD,
  unofficial-currency, and unknown-currency movements stay visible in the
  ledger but do not enter USD budget arithmetic.
- Income and allocation editing, richer progress visuals, and mortgage
  owed/home-value context remain issue #12. This slice establishes the
  calculation and copy boundaries those controls will mutate.
- Sharing one destination across categories is supported deterministically,
  but the issue #12 editor should clearly warn when a destination is reused.

### Issue #12 Budget 3a experience evidence — 2026-09-25

Implementation:

- Replaced the foundation-only budget surface with the approved 3a composite:
  the 2c month/income/pace/left-to-budget header, allocation bar beside “Where
  it goes,” 2a planned-to-destination rows in every section, and structured
  Flex progress with planned, spent, left, and over states.
- Added household-scoped income and allocation editing. Amounts cross Route
  Handler boundaries as decimal strings, normalize to exact minor units, and
  persist through Prisma Decimal. The server rejects negative, oversized,
  fractional-cent, malformed, inactive, archived, non-USD, and foreign values
  without accepting a household ID.
- Added optimistic revision checks for both edit boundaries. Stale
  `updatedAt` values return stable `BUDGET_EDIT_CONFLICT` responses instead of
  overwriting a concurrent edit.
- Destination reuse is visible before save and returned by the server after
  save. Reused accounts continue to consume one matched-transfer pool in
  deterministic budget order, so movements are never duplicated.
- Needs rows whose destination is a linked debt account show current amount
  owed and linked home value. Any future position is explicitly labelled
  “after remaining plan”; no transaction-aligned historical balance is
  fabricated.
- Forms use native labelled inputs, selects, and buttons; associated
  `aria-invalid` errors, alert/status regions, keyboard submission, restored
  focus, 44px controls, text status, responsive paired-row stacking, and
  reduced-motion overrides. The production prototype remained unchanged.

Verification:

- Targeted budget calculation/editing and two-household boundary suites — 3
  files and 34 tests passed.
- Focused Budget desktop/mobile Playwright flow — 2 tests passed, including
  exact edit persistence, invalid-field focus and announcement, destination
  reuse, mortgage context, keyboard save and focus restoration, paired layout
  behavior, responsive overflow, reduced motion, 44px targets, and axe WCAG
  2.1 AA scans.
- `npm test` — 25 files and 154 tests passed.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` passed.
- `npx prisma validate` and `npx prisma migrate status` passed; all seven
  migrations are applied and no issue #12 migration was required.
- `npm run build` passed with Next.js 16.3.5.
- `npm run test:e2e` — 17 desktop/mobile tests passed and the mobile duplicate
  of the Chromium-only passkey case was skipped as expected.
- `git diff --check` and edited-file IDE diagnostics passed with no findings.

Remaining risks:

- Budgets intentionally remain USD-only for private v1. Other currencies stay
  visible in the movement ledger and are excluded from budget arithmetic and
  destination choices.
- Current account positions are not transaction-aligned historical balances.
  The UI labels them as current and labels the simple remaining-plan
  projection; it does not claim a sourced post-transaction balance.
- Shared destinations are supported and clearly warned, but allocation
  reordering remains category-maintenance work rather than an implicit budget
  editor behavior.

### Issue #13 Accounts-experience evidence — 2026-09-26

Implementation:

- Replaced the maintenance-first account grid with the approved balance-sheet
  direction: Cash, Invested, Property, and Debt groups in product order, each
  with an exact per-currency subtotal, followed by a visible equation that
  reconciles source subtotals to household net worth.
- Converted shared position totals to `Prisma.Decimal` arithmetic serialized
  as fixed two-decimal strings. Manual valuation inputs now validate decimal
  strings and reject fractional cents before writing; browser numbers are
  never authoritative for account arithmetic.
- Plaid and manual rows share one presentation while retaining source and
  connection labels. Native disclosures expose connection state, latest real
  observation, provider availability, recent activity, an honest unavailable
  projection, and source-appropriate actions.
- Kept property and debt in their own source groups. A property disclosure
  presents linked signed debts and same-currency derived equity without moving
  the mortgage out of the Debt subtotal.
- Added the labelled “Net worth, last 8 months” view. It emits points only at
  real snapshot observation times after every currently active account has a
  known position in one currency; unavailable, incomplete, and multi-currency
  histories explain the limitation instead of filling gaps or applying FX.
- Added a household-scoped remediation form for Plaid accounts with unknown
  provider types. The selected classification survives later unknown-type
  syncs, while recognized provider types remain authoritative.
- Integrated manual create, edit, dated valuation, archive, property/debt
  linking, Plaid refresh/reconnect/disconnect, exact status announcements,
  visible focus, 44px controls, responsive layouts, and reduced-motion
  behavior without changing any prototype file.

Verification:

- Targeted account-domain, snapshot, sync, generalized-model, and
  two-household boundary suites passed: 8 files and 50 tests before the final
  repository-wide run.
- `npm test` passed: 27 files and 163 tests.
- Focused Accounts Playwright coverage passed on desktop and mobile: 2 tests
  covering grouped arithmetic, native keyboard disclosures, source/status
  detail, recent activity, available balance, property equity, classification
  persistence, incomplete/multi-currency states, responsive overflow, reduced
  motion, no Plaid-host requests, and axe WCAG 2.1 AA scans.
- `npm run test:e2e` passed: 19 desktop/mobile tests, with the mobile duplicate
  of the Chromium-only passkey case skipped as expected.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npx prisma validate`, `npx prisma migrate status`, `npm run build`,
  `git diff --check`, and edited-file IDE diagnostics passed. Prisma reports
  all seven migrations applied and the Next.js 16.3.5 production build
  generated all 21 static-generation tasks.
- GitLab
  [pipeline #26](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2885864417)
  passed the starting commit `18e1512` in 155 seconds before issue #13 work
  began.

Remaining risks:

- Historical trend comparability is intentionally limited to accounts active
  today because inactive Plaid accounts do not carry a reliable deactivation
  timestamp. Currents omits an unsupported trend rather than claiming a
  historical household roster it cannot source.
- Account projections remain unavailable. A future projection requires
  explicit recurrence and timing semantics; current transactions and position
  snapshots are not silently repurposed as a forecast.
- Automated Plaid coverage uses in-process mocks, and browser coverage blocks
  Plaid-host requests. Real institution balance timing and provider-specific
  account types still require Trial/staging verification.

### Issue #14 Categories-maintenance evidence — 2026-09-27

Implementation:

- Added the complete household-scoped Categories workspace: create, rename,
  move between Needs/Flex/Savings/Debt, keyboard reorder, soft archive,
  restore, and explicit merge. Product grouping and category selection share
  the approved searchable grouped picker.
- Added Serializable revision checks for category-list, category, merchant-rule,
  and transaction-assignment writes. Duplicate names, stale writes, foreign
  identifiers, archived destinations, conflicting exact rules, missing merchant
  keys, and persistence failures return explicit states. Transient PostgreSQL
  serialization conflicts retry three times before becoming visible conflicts.
- Archive preserves historical transactions, Decimal budget allocations,
  destination accounts, and merchant rules. Paused rules and archived budget
  references are labelled honestly; future assignment and month-copy choices
  include active categories only.
- Explicit merge moves only category references, combines same-month plans with
  Prisma Decimal arithmetic, and blocks different destination accounts before
  any write. It does not rewrite transaction source fields.
- Merchant-rule creation, editing, retargeting, and deletion display the exact
  normalized key. Assignment and optional rule changes remain transactional,
  household-scoped, and exact-match only.
- Native controls, associated errors, alert/status announcements, visible
  focus, 44px targets, responsive stacking/overflow protection, and
  reduced-motion behavior are covered on desktop and mobile. No prototype file
  changed.

Verification:

- Targeted category-domain, maintenance, review, and two-household isolation
  suites passed: 4 files and 45 tests.
- `npm test` passed: 28 files and 174 tests.
- Focused Categories Playwright coverage passed on desktop and mobile,
  including grouped search, keyboard and touch operation, persistence,
  validation/focus announcements, archive/restore/merge integrity, exact-rule
  editing, responsive overflow, reduced motion, 44px targets, and axe WCAG
  2.1 AA scans.
- `npm run test:e2e` passed: 21 desktop/mobile tests, with the mobile duplicate
  of the Chromium-only passkey case skipped as expected.
- `npm run typecheck`, `npm run lint`, the issue-file Prettier check,
  `npx prisma validate`, `npx prisma migrate status`, and `npm run build`
  passed. Prisma reports all eight migrations applied.
- `git diff --check` and edited-file IDE diagnostics passed. The exact
  repository-wide Prettier check reports only the unrelated untracked
  `docs/references/youtube-ux-portfolio-presentation-3uB_kn4HwKc.md`; no issue
  #14 or tracked file has a formatting finding.

Remaining risks:

- Merge is intentionally not automatically reversible. The confirmation names
  the source and target and the mutation reports migrated dependency counts.
- Exact merchant identity cannot be derived when both merchant and transaction
  names are absent. Currents leaves rule creation unavailable instead of
  inventing a key.
- Category names are enforced case-insensitively in Serializable application
  logic; a future multi-writer service should add a database-normalized unique
  key before bypassing these boundaries.

### Issue #15 traceable-Home evidence — 2026-09-27

Implementation:

- Added one household-scoped, server-only Home data layer that composes the
  existing account-position, movement, snapshot, and Budget services. The page
  derives the household from authenticated membership and accepts only a
  validated `month=YYYY-MM` selection.
- Centralized UTC month parsing, navigation, boundaries, and pace for Home and
  Budget. A past month covers the complete month, the current month covers the
  first day through the current UTC day, and a future month has no elapsed
  period. Comparisons use the previous month with the same elapsed-day count,
  capped to the number of days in that month, and state that basis in full.
- Current net worth reuses centralized signed positions and keeps currencies
  separate. Missing balances or currencies produce partial/unavailable
  messages. Period change is the difference between the latest complete
  recorded net-worth point in each compared period; absent points and currency
  mismatches remain unavailable, and gaps are never synthesized.
- Income and spending sum fixed-point movement amounts per currency. Matched
  transfers contribute zero to both; pending movements remain included and are
  labelled. Category totals use categorized outflows only and retain archived
  category labels.
- Savings movement and debt paydown use the Budget model's matched-transfer
  semantics: only the incoming leg into an explicit active USD destination
  contributes, and one transfer is counted once. An allocation without a
  destination contributes zero and makes the Home result partial or
  unavailable rather than allowing ordinary categorized activity to masquerade
  as movement.
- “Remaining this month” is the positive fixed-point Budget remainder
  `max(planned − activity, 0)` for Needs, Savings, and Debt. It is explicitly a
  remaining plan amount, not a due date, scheduled withdrawal, or prediction.
- Added the complete 4a-style hierarchy: accessible month controls, comparison
  basis, current net worth, the labelled “Net worth, last 8 months” figure with
  a visible summary and data-list fallback, cash flow, category spending,
  recent one-row movements with expandable transfer legs, Budget moved/due
  status, remaining plan amounts, and Cash/Invested/Property/Debt rollups.
  Empty and unavailable states remain explicit on every surface.
- Added responsive Nocturne layouts, logical focus order, native links and
  buttons, 44px targets, disclosure state, text equivalents for graphics,
  reduced-motion behavior, and WCAG 2.1 AA scans. No prototype file or database
  schema changed.

Verification:

- Targeted Home tests passed: 8 domain/unit tests and 1 comprehensive
  integration test covering two-household isolation, more than 100 movements,
  current/past/future months, pending and matched transfers, archived records,
  no accounts/snapshots/transactions/Budget, incomplete positions, snapshot
  gaps, and multiple currencies.
- `npm run test:unit` passed: 17 files and 92 tests.
- `npm run test:integration` passed: 13 files and 91 tests.
- `npm test` passed: 30 files and 183 tests.
- Focused Home Playwright coverage passed on desktop and mobile. It verifies
  dynamic month navigation, real values and comparison labels, chart text and
  data fallback, keyboard transfer disclosure, Budget and account summaries,
  empty/unavailable states, visible focus, 44px targets, reduced motion,
  responsive overflow at 375, 768, 1024, 1280, 1440, and 1920 CSS pixels, axe
  WCAG 2.1 AA scans, and zero Plaid-host requests.
- `npm run test:e2e` passed: 23 desktop/mobile tests; the mobile duplicate of
  the Chromium-only passkey case was skipped as expected.
- `npm run typecheck`, `npm run lint`, the issue-file Prettier check,
  `npx prisma validate`, `npx prisma migrate status`, and `npm run build`
  passed. Prisma reports all eight migrations applied, and the Next.js 16.3.5
  production build generated all 21 static-generation tasks.
- `git diff --check` and edited-file IDE diagnostics passed.

Remaining risks:

- Historical net-worth completeness remains intentionally limited to accounts
  active today because inactive Plaid accounts have no reliable historical
  deactivation timestamp. The dashboard reports missing comparison data rather
  than inventing an account roster or filling snapshot gaps.
- Budget plans and destination movement are USD-only in private v1. Other
  currencies remain separate in positions, cash flow, categories, and the
  ledger and are never silently converted.
- Pending movements are included because that is the canonical movement
  semantics, so selected-period totals can change when a bank posts, modifies,
  or removes them; the dashboard labels their count.
- “Remaining this month” has no scheduling claim. Supporting actual upcoming
  due dates requires a future recurrence or obligation model.

### Issue #17 operations evidence — 2026-09-28 (blocked)

Inspection (read-only except the accidental domain noted below):

- Canonical `main` contains issue #17 implementation commit `75ec5bb`.
- Railway project Currents has isolated production and staging environments.
  Each has its own PostgreSQL volume, web, worker, and sync-cron
  (`17 */6 * * *`). Production and staging database credentials differ, and
  every application `DATABASE_URL` uses the private
  `postgres.railway.internal` host.
- Public web origin is `https://web-production-5ec4a.up.railway.app`. Worker
  and PostgreSQL have no domains. Staging web is
  `https://web-staging-7944.up.railway.app`; its worker, cron, and PostgreSQL
  also have no domain or TCP proxy. Both `/api/health` endpoints returned
  `{"status":"ok"}`.
- Production web has no `AUTH_DEV_BYPASS` and no `PASSKEY_BOOTSTRAP_TOKEN`.
  `AUTH_URL`, `PASSKEY_ORIGIN`, and the webhook host share that Railway
  hostname. `PASSKEY_RP_NAME` is Currents. Auth and encryption key
  fingerprints differ. `PLAID_ENV` is sandbox. Application `DATABASE_URL`
  values use `postgres.railway.internal`. GitLab CI project variables are
  empty.
- Staging uses a separate Auth.js secret, encryption key, PostgreSQL password,
  passkey origin/RP ID, webhook URL, and a newly created Plaid team with
  Sandbox credentials. Staging web and worker share only their staging
  encryption and Plaid values; all differ from production. Neither deployed
  environment defines the development bypass or bootstrap token.
- PITR is enabled, has 15 backup sets, and reports a healthy WAL archiver.
  No volume-backup schedule is configured. The approved Daily + Weekly command
  is blocked by Railway `OAUTH_INSUFFICIENT_GRANT`.
- Workspace compute limits remain unset. Railway rejects the approved $15
  alert/$40 hard limit because the workspace has no active subscription. The
  separate Railway agent hard limit remains $1.50.
- Production domain inventory now proves only web is public. The accidental
  sync-cron domain is absent; no deletion was needed.

In-repo implementation and local verification:

- Runtime isolation guards, allowlisted operational snapshots, transactional
  restart-safe encryption rotation, a staging-only disposable rotation
  exercise, Plaid environment mapping, environment-specific CSP, and
  PII-scrubbed request-error reporting.
- Targeted runtime, header, secret, snapshot, and rotation coverage passed:
  4 files and 12 tests before the disposable-exercise test was added; the
  operations integration file now passes all 3 tests.
- `npm run test:unit` passed: 19 files and 99 tests.
- `npm run test:integration` passed: 14 files and 94 tests.
- `npm test` passed: 33 files and 193 tests.
- `npm run typecheck`, `npm run lint`, scoped Prettier, `npx prisma validate`,
  `npx prisma migrate status`, `npm run build`, and edited-file diagnostics
  passed. Prisma reports all eight migrations applied and Next.js generated
  all 21 static pages.
- Focused operations Playwright passed, and `npm run test:e2e` passed after
  restoring its missing pinned Chromium binary: 31 passed and the expected
  mobile passkey duplicate skipped.
- GitLab
  [pipeline #32](https://gitlab.com/piaanderson-group/anderson-finance-app/-/pipelines/2891596022)
  passed commit `75ec5bb`; the server-side GitHub deployment mirror resolved
  to the same commit. Railway production and staging deployments for web,
  worker, cron, and PostgreSQL reported `SUCCESS`.
- The deployed staging CSP permits Plaid Sandbox and excludes Plaid Production;
  `/api/health` returned HTTP 200 after the rotation redeploy.

External operations evidence:

- Staging web and worker moved together from encryption-key version 1 to 2
  while retaining the matching version-1 key. The staging-only exercise
  rotated one disposable encrypted Item, left zero old-version rows, changed
  ciphertext, decrypted with the current key, proved the previous key remained
  available, proved every non-removed Item was current, and removed its
  fixture. No key material or ciphertext was printed.
- The latest inspected production worker snapshot reported zero pending,
  running, and failed jobs and zero login-required, error, and stale active
  Items. The latest cron snapshot reported one newly enqueued pending job,
  zero running or failed jobs, zero-second lag, and zero login-required,
  error, or stale active Items. Across 316 inspected records there were no
  financial-payload keys or blocked sensitive terms.
- PITR remains healthy with 15 backup sets and a healthy WAL archiver. The
  separately approved Daily + Weekly volume schedule remains unavailable:
  Railway returned `OAUTH_INSUFFICIENT_GRANT`.
- The approved $15 usage alert and $40 workspace hard limit remain
  unavailable: Railway returned “Usage limits require an active
  subscription.” No workaround was attempted.

At the 2026-09-28 checkpoint, issue #17 remained open because its usage-alert
and spending-limit criterion could not be satisfied. On 2026-10-02 Railway
reported the $15 alert and $40 hard limit active. The owner explicitly retained
Hobby and accepted continuously verified PITR plus encrypted logical backups
instead of Pro-only Daily + Weekly volume snapshots. Issue #17 is ready to
close after this evidence is published.

### Issue #18 restore and release-audit evidence — 2026-10-02 (Plaid blocked)

External inspection and restore attempt:

- Issue #18 moved to `workflow::in-progress`.
- Production PITR is enabled with 15 backup sets. The latest backup was
  `2026-10-02T19:24:31Z`; the WAL archiver was healthy and last archived at
  `2026-10-02T22:36:34Z`.
- The workspace reports the $15 soft alert and $40 hard limit active. The
  volume-schedule list remains empty under the owner-approved Hobby scope.
- Production and staging web, worker, sync-cron, and PostgreSQL deployments
  report `SUCCESS` at their expected revisions. Production web reports
  `SUCCESS` at `04b49dc`. Only web is public in each environment.
- Safe production source counts were captured without financial values or
  identifying source data: 8 migrations, 1 household, 1 user, 1 membership,
  1 active Plaid Item, 14 accounts, 14 snapshots, 396 transactions, 0 transfer
  matches, 0 categories, 0 merchant rules, 0 Budget months/allocations, and 1
  completed-or-historical SyncJob with 0 pending/running/failed.
- Count-only integrity checks returned zero errors for household membership,
  Item/account ownership, snapshots, transaction/category references,
  transfer legs, Budget destinations, property/debt links, and merchant-rule
  categories. Token metadata reported one production version-1 Item and zero
  missing ciphertext/IV/tag rows; no token was printed or decrypted.
- With explicit approval, a production custom-format dump streamed directly
  through GPG AES-256 encryption. No plaintext dump was created. Backup and
  encryption took 4.434 seconds; format verification passed.
- A fresh PostgreSQL database bound only to local loopback received
  `pg_restore --clean --if-exists` in 0.388 seconds. All eight migrations were
  current; every safe count matched; all ten relationship checks returned
  zero; token metadata matched; and safe application ORM reads returned the
  expected counts.
- After separate approval, the disposable database, socket, temporary random
  passphrase, and encrypted test archives were deleted. Production and staging
  were never restored, cleaned, overwritten, or changed.

Local audit and correction:

- `npm ci`, Prisma validation and migration status, typecheck, lint, and the
  repository-wide formatting check passed.
- The initial production dependency audit found critical Next.js advisory
  `GHSA-vcvr-r3jv-pc5j`. A non-breaking audit update moved the lockfile from
  Next.js 16.3.5 to 16.3.8. The final production audit reports zero findings.
  The full audit reports two moderate development-only `@vitest/mocker`
  findings whose offered fix is the breaking Vitest 5 upgrade; no forced
  update was applied.
- `npm run test:unit` passed 20 files/100 tests,
  `npm run test:integration` passed 14 files/94 tests, and `npm test` passed
  34 files/194 tests.
- The production build passed on Next.js 16.3.8 with all 21 static-generation
  tasks.
- The browser suite exposed a stale assumption that September 2026 was always
  the current month. The Home acceptance test now derives current/future UTC
  months. Its focused desktop/mobile run passed, and the complete suite passed
  31 tests with the expected duplicate mobile passkey ceremony skipped.
- Request-error instrumentation now has a direct unit test proving error
  messages, authorization headers, and query strings do not enter the
  allowlisted log record. The populated Security route now receives an axe
  scan after passkey and recovery-code use.
- GitLab and mirrored GitHub CI now gate on the production dependency audit,
  repository formatting, and both desktop and mobile Playwright projects.
- The approved read-only production `railway config plan --json` returned
  `ok: true`, no diagnostics, no changes, and `No changes.` Nothing was
  applied.
- `docs/RAILWAY.md` now states accurately that PostgreSQL custom format is
  compressed/structured but not encrypted. It documents a protected direct
  stream and a real GPG layer when a local archive is necessary.
- The requirement matrix, deployment inventory, Plaid Trial/Production gates,
  restore record, blockers, and no-go conclusion are recorded in
  [`docs/PRIVATE_V1_RELEASE_AUDIT.md`](./PRIVATE_V1_RELEASE_AUDIT.md).

Issue #18 cannot move to review or close yet. The restore and current Railway
controls are proven, and issue #17 closed after pipeline #35, the server-side
mirror, and the production deployment succeeded. Plaid Trial access and
real-institution OAuth, webhook, reauthentication, and `LOGIN_REPAIRED`
behavior remain unproven. Paid Plaid Production remains a documented later
gate, not a readiness claim. Roadmap issue #1 and the Currents goal remain
open.

## Next handoff

Complete Plaid Trial and test a real institution in staging before any
separately authorized production credential or environment change. Keep issue
#18, roadmap issue #1, and the Currents goal open until that evidence exists.
Do not start commercialization work.
