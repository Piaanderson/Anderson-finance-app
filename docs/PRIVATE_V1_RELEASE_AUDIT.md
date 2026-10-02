# Private-v1 release audit

Audit date: 2026-10-02
Owner: Pia Anderson
Scope: Currents private-household v1 at GitLab `main` commit `04b49dc`,
plus this publication-status follow-up.

## Conclusion

**NO-GO for real-data daily use.**

The implemented product, household authorization, local security controls,
automated accessibility coverage, current production topology, usage controls,
and logical recovery path have strong direct evidence. Release readiness is
still incomplete because Plaid Trial access and real-institution OAuth,
webhook, reauthentication, and `LOGIN_REPAIRED` behavior have not been proven.
The later paid Plaid Production gates are documented but are not represented
as complete.

Issue #17 closed after commit `04b49dc`, pipeline #35, the server-side mirror,
and the production web deployment all succeeded.

Issue
[#18](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/18),
roadmap issue
[#1](https://gitlab.com/piaanderson-group/anderson-finance-app/-/issues/1),
and the Currents goal must remain open.

## Release scope

Included:

- one private household and its owner;
- passkey and recovery-code authentication;
- Plaid Sandbox and manual Cash, Invested, Property, and Debt accounts;
- transaction synchronization, transfer review, category review, exact
  merchant rules, monthly budgets, account maintenance, and the Home summary;
- Railway web, worker, six-hour reconciliation cron, PostgreSQL, PITR, and
  staging;
- Railway Hobby operation with continuously verified PITR plus encrypted,
  portable logical backups before risky migrations and during release/recovery
  drills.

Excluded:

- public registration, invitations, household switching, billing, and
  commercialization;
- AI features;
- Railway Pro-only scheduled volume snapshots. On 2026-10-02 the owner
  explicitly accepted PITR plus encrypted logical backups instead of raising
  the monthly plan floor solely for Daily + Weekly snapshots;
- a switch from the separately held production Sandbox credentials to Plaid
  Trial or Production.

## Requirement-to-evidence matrix

### Product

- **Proven locally — full balance sheet.** `docs/ACCOUNT_MODEL.md`,
  `tests/integration/financial-account-model.test.ts`,
  `tests/integration/manual-accounts.test.ts`, and
  `tests/e2e/accounts-experience.spec.ts` cover Plaid and manual Cash,
  Invested, Property, and Debt, signed positions, snapshots, and property/debt
  links.
- **Proven locally — one-row transfers with honest legs.**
  `docs/MOVEMENT_MODEL.md`, `src/features/transactions/movements.test.ts`,
  `tests/integration/movements.test.ts`, and the transfer browser flow cover
  one movement, two unchanged source legs, source descriptions, and an honest
  unavailable balance-movement state.
- **Proven locally — conservative and reversible transfer review.**
  `src/features/transactions/transfer-suggestions.test.ts`,
  `tests/integration/transfer-review.test.ts`, and
  `tests/e2e/accessibility.spec.ts` cover eligibility, ambiguity,
  confirmation, conflict handling, tie, untie, and retie.
- **Proven locally — category review and exact rules.**
  `docs/CATEGORY_MODEL.md`, `tests/integration/category-review.test.ts`,
  `tests/integration/category-maintenance.test.ts`, and the category browser
  flows cover grouped keyboard assignment, exact normalized keys, archive,
  restore, edit, and merge.
- **Proven locally — monthly Budget.** `docs/BUDGET_MODEL.md`,
  `src/features/budget/budget-domain.test.ts`,
  `tests/integration/budget-foundation.test.ts`, and the Budget browser flow
  cover editing, conflict handling, moved/due, Flex progress, explicit
  destinations, copied months, and transfer exclusion.
- **Proven locally — required pages.** The production routes
  `/dashboard`, `/budget`, `/accounts`, `/transactions`, and `/categories`
  build successfully and are included in the route-wide browser audit.
- **Proven by search and tests — no production scenario constants.** Searches
  under `src/` found the September scenario values only in unit-test fixtures.
  The Home, Budget, Accounts, Transactions, and Categories reads use
  household-scoped server data.
- **Proven locally — sourced history and honest gaps.**
  `docs/ACCOUNT_MODEL.md`, `tests/integration/accounts-experience.test.ts`,
  `tests/integration/dashboard-data.test.ts`, and the Home/Accounts browser
  tests cover real snapshot observations, incomplete and multi-currency
  states, and the prohibition on interpolation or reconstructed running
  balances.

### Security

- **Proven locally — household-scoped finance mutations.**
  `tests/integration/finance-household-isolation.test.ts` exercises Plaid,
  transfer, category, Budget, account, and category-maintenance boundaries
  against two households. Its inventory guard fails when an unclassified
  finance mutation is added.
- **Proven locally — encrypted, server-only Plaid tokens.**
  `src/server/secrets.ts`, `src/server/secrets.test.ts`, server-only Plaid
  routes, and database constraints cover AES-256-GCM metadata and key
  versions. The production source check found one non-removed Item on key
  version 1 and zero rows with missing ciphertext, IV, or tag metadata; no
  token was printed or decrypted.
- **Proven locally — webhook verification.**
  `src/server/plaid/webhooks.ts` and its 15-test suite cover ES256 signatures,
  age, body hashes, malformed input, key lookup, and idempotent enqueueing.
- **Proven in deployed configuration — no production bypass/bootstrap.**
  Issue #17 inspected Railway variable names and runtime guards; production
  has neither `AUTH_DEV_BYPASS` nor `PASSKEY_BOOTSTRAP_TOKEN`.
  `src/server/runtime-context.test.ts` and `src/server/secrets.test.ts` cover
  fail-closed behavior.
- **Proven in deployed configuration — origin alignment.** Production
  `AUTH_URL`, `PASSKEY_ORIGIN`, `PASSKEY_RP_ID`, and the webhook host use
  `web-production-5ec4a.up.railway.app`. Passkey configuration tests cover the
  origin/RP-ID rules.
- **Proven deployed — browser security headers.** Production and staging
  `/api/health` returned HTTP 200 with CSP, HSTS, frame denial, MIME-sniffing
  protection, strict referrer policy, permissions policy, and opener
  isolation. Both CSPs permit Sandbox and do not permit Plaid Production.
- **Proven locally and previously inspected in production — safe logging.**
  Plaid synchronization and request-instrumentation tests reject sensitive
  payloads. `src/instrumentation.test.ts` proves that request-error logging
  omits the error message, authorization header, and query string. Issue #17
  inspected allowlisted worker/cron snapshots and found no blocked financial
  fields or secret terms.
- **Proven deployed — environment isolation.** Production and staging have
  separate PostgreSQL volumes, Auth.js secrets, encryption keys, passkey
  origins, webhook URLs, and Plaid Sandbox teams. Only each web service has a
  public domain.
- **Proven deployed — staging-only rotation.** The staging exercise moved its
  disposable Item from key version 1 to 2 and cleaned it up. The current
  production metadata remains at version 1, supporting the claim that
  production keys were not rotated.

### Accessibility

- **Proven automatically — every route.**
  `tests/e2e/phase-7-audit.spec.ts` runs WCAG 2.1 A/AA axe scans against sign
  in, setup, Home, Budget, Accounts, Transactions, Categories, and Security in
  desktop Chromium and mobile projects.
- **Proven through browser interaction — keyboard, focus, and semantics.**
  `tests/e2e/accessibility.spec.ts`,
  `tests/e2e/accounts-experience.spec.ts`, and
  `tests/e2e/home-dashboard.spec.ts` exercise the skip link, disclosures,
  transfer review, grouped category assignment, Budget editing, account
  maintenance, passkeys, recovery codes, associated errors, alerts, and
  polite statuses.
- **Proven through browser rendering — responsive behavior.**
  `tests/e2e/phase-7-audit.spec.ts` checks reflow, overflow, touch targets, and
  reduced motion. `docs/ACCESSIBILITY_AUDIT.md` records direct rendered checks
  at 320, 375, 390, 412, 512, 768, 1024, 1280, 1440, and 1920 CSS pixels.
- **Proven automatically — component details.** Browser checks cover
  44-by-44 targets, visible focus, live regions, labels and associated errors,
  native/custom disclosure state, chart names and visible data summaries, and
  reduced animation/transition durations. The populated Security route is
  rescanned after passkey creation, recovery-code generation, passkey sign-in,
  and recovery-code sign-in.
- **Pending publication — CI enforcement.** Both CI definitions now run the
  complete desktop/mobile Playwright projects; GitLab previously gated only
  the desktop Chromium project.
- **Residual limitation.** The direct inspection was agent-driven and is not a
  human VoiceOver, NVDA, JAWS, TalkBack, or physical-device certification.
  This is recorded as residual risk rather than represented as proof.

### Plaid

- **Proven — Sandbox code and existing private data path.** Mocked unit and
  integration tests cover Link tokens, exchange, synchronization pagination,
  webhooks, jobs, Item recovery, disconnect, reconnect/update mode, and
  `LOGIN_REPAIRED`. Earlier Sandbox worker evidence completed real
  synchronization. The current production source has one active Sandbox Item,
  14 accounts, 14 snapshots, and 396 transactions.
- **Not proven — Trial.** Still required: a Trial-enabled application/team,
  real-institution Link, OAuth redirect handling where required, consent
  expiration, reauthentication, a signed Trial webhook, and observed
  `LOGIN_REPAIRED` behavior.
- **Not proven — Production.** Still required: Plaid company and application
  approval, production security review, OAuth configuration, Production
  credentials, the Production webhook, institution-specific OAuth redirects,
  real-institution reauthentication, and observed `LOGIN_REPAIRED` recovery.
- **Guardrail retained.** No Plaid environment or credential was changed in
  issue #18. Sandbox success is not Production readiness.

### Railway operations

- **Proven deployed — topology and health.** Production and staging web,
  worker, sync-cron, and PostgreSQL deployments report `SUCCESS` at
  their expected revisions. Production web reports `SUCCESS` at `04b49dc`.
  Only web has a domain. Both PostgreSQL volumes report `READY`.
- **Proven locally — runtime isolation and migration behavior.**
  `src/server/runtime-context.test.ts` and
  `tests/integration/operations.test.ts` cover environment guards and
  staging-only rotation. Web and worker execute `prisma migrate deploy` before
  start in `.railway/railway.ts`.
- **Proven deployed — PITR/WAL.** PITR is enabled with 15 backup sets. On
  2026-10-02 the latest backup was `2026-10-02T19:24:31Z`; the WAL archiver
  was healthy and last archived at `2026-10-02T22:36:34Z`.
- **Accepted scope — volume schedules.** The schedule list remains empty.
  Railway's current dashboard says creating backups and enabling PITR require
  Pro. The owner chose to retain Hobby and explicitly replaced Daily + Weekly
  volume snapshots with the existing PITR plus encrypted portable logical
  backups. This is an accepted risk, not a configured control.
- **Proven deployed — usage controls.** Railway reports a $15 soft usage alert,
  a $40 workspace hard limit, and `isOverLimit: false`.
- **Proven — restore drill.** See the restore record below.
- **Proven read-only — final IaC plan.** The approved production
  `railway config plan --json` returned `ok: true`, no diagnostics, an empty
  change set, and `No changes.` No plan was applied.

## Restore-drill record

Result: **SUCCESSFUL ENCRYPTED LOGICAL BACKUP AND ISOLATED LOCAL RESTORE.**

The earlier Railway attempt remains useful evidence: on 2026-10-01 the
isolated environment `private-v1-restore-20261001` could not provision
PostgreSQL on the then-current resource capability. It contained no service,
database, volume, domain, or proxy and was deleted after separate approval.

On 2026-10-02 the owner explicitly approved a lower-cost recovery scope:
continuing Railway PITR plus encrypted portable logical backups, restored into
an isolated disposable PostgreSQL database on the operator's Mac.

1. Read-only PITR inspection passed with 15 backup sets, a current recovery
   point, and healthy WAL archiving.
2. Safe source counts and integrity results were captured before the dump.
3. Production `pg_dump --format=custom --no-owner --no-privileges` streamed
   directly through GPG AES-256 symmetric encryption. No plaintext dump file
   was created. The encrypted archive was 29,219 bytes and backup/encryption
   completed in 4.434 seconds.
4. Decrypting the archive directly into `pg_restore --list` succeeded before
   restore.
5. A fresh PostgreSQL 18.3 cluster listened only on local loopback with a
   private Unix socket. It had no public domain, proxy, or remote listener.
   The first start attempt hit macOS's Unix-socket path-length limit; the
   cluster started successfully with a shorter private socket path.
6. The verified encrypted archive restored in 0.388 seconds using
   `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error`
   against only the disposable `currents_restore` database.
7. `npx prisma migrate status` found all eight migrations and reported the
   restored schema current.
8. Every safe source and restored count matched exactly. All ten relationship
   checks returned zero errors.
9. Token metadata matched: one non-removed key-version-1 Item and zero missing
   ciphertext, IV, or tag values. No token was printed or decrypted.
10. Application ORM reads succeeded against the restored database and returned
    only counts: one household, one connection, 14 accounts, 14 latest
    snapshots, 396 transactions, and zero transfer, category, rule, or Budget
    rows.
11. After separate explicit approval, the local server was stopped and the
    exact disposable cluster, private socket, temporary random passphrase, and
    encrypted test archives were deleted. Production and staging were never
    restored, cleaned, overwritten, or changed.

Safe production source baseline captured without names, descriptions,
balances, provider IDs, tokens, or transaction data:

- migrations 8; households 1; users 1; memberships 1;
- Plaid Items 1 active, 0 login-required, 0 error, 0 removed;
- financial accounts 14; position snapshots 14; transactions 396;
- transfer matches 0; categories 0; merchant rules 0;
- Budget months 0; allocations 0;
- sync jobs 1 total, 0 pending, 0 running, 0 failed.

Source integrity checks returned zero errors for membership ownership, Plaid
Item/account ownership, account snapshots, transaction account/category
references, transfer legs, Budget allocation destinations, property/debt
links, and merchant-rule categories.

The matching restored baseline, migration result, integrity checks, and safe
application reads are direct restore evidence. Reusable checks live in
`scripts/restore-audit.sql` and `scripts/restore-app-read-check.ts`; neither
prints raw financial rows or token material.

## Dependency and test record

- `npm ci` — passed; 495 packages installed.
- Initial `npm audit --omit=dev` — failed on critical Next.js advisory
  `GHSA-vcvr-r3jv-pc5j`.
- `npm audit fix` — updated the lockfile from Next.js 16.3.5 to 16.3.8 and
  updated safe transitive packages.
- Final `npm audit --omit=dev` — passed with zero production findings.
- Final full `npm audit` — two moderate development-only
  `@vitest/mocker` findings remain; the offered fix is the breaking Vitest 5
  upgrade and was not forced.
- `npx prisma validate` — passed.
- `npx prisma migrate status` — eight migrations; local schema current.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run test:unit` — 20 files, 100 tests passed.
- `npm run test:integration` — 14 files, 94 tests passed.
- `npm test` — 34 files, 194 tests passed.
- `npm run build` — Next.js 16.3.8 compiled all 21 static-generation tasks.
- `npm run test:e2e` — 31 passed; the duplicate mobile passkey ceremony was
  skipped as designed.
- The Home browser test initially exposed a date-dependent September-current
  assumption. It now derives the current and next UTC months and passed in
  desktop and mobile projects.
- `git diff --check` — passed after all issue #18 edits.
- Repository-wide and issue-file formatting checks — passed.
- Edited-file IDE diagnostics — no findings.

Test counts are not used as proof by themselves; each matrix item above names
the suite or source boundary that exercises the behavior.

## Current deployment inventory

- Production public web:
  `https://web-production-5ec4a.up.railway.app`
- Production private services: worker, sync-cron, PostgreSQL.
- Staging public web:
  `https://web-staging-7944.up.railway.app`
- Staging private services: worker, sync-cron, PostgreSQL.
- Production and staging sync cron: `17 */6 * * *`.
- Current production web deployment commit: `04b49dc`.
- Latest GitLab pipeline: #35 passed.
- GitLab-to-GitHub server-side mirror: enabled, `finished`, no error. GitHub is
  not a direct push target; mirrored `main` matches `04b49dc`.
- No disposable Railway or local database, volume, socket, passphrase, or
  backup artifact remains after separately approved cleanup.

## Required next actions

Owner: Pia Anderson. Next review: 2026-10-08, or earlier when Plaid responds
to the pending access review.

1. Complete Plaid Trial and record real-institution OAuth, reauthentication,
   webhook, and `LOGIN_REPAIRED` evidence.
2. Complete Plaid Production application/security approval and configure
   Production credentials and webhook only under separate authorization.
3. Keep issue #18, roadmap issue #1, and the Currents goal open until the
   remaining Plaid evidence is direct.
