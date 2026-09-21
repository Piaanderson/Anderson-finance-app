# Security baseline

Currents processes sensitive financial metadata. Treat production logs,
database exports, credentials, and support screenshots as confidential.

## Secrets and tokens

- Plaid access tokens are accepted only by server routes and encrypted with
  AES-256-GCM before storage.
- `TOKEN_ENCRYPTION_KEY` must be a random 32-byte base64 value stored in
  Railway variables. It must never use the same value as `AUTH_SECRET`.
- To rotate keys, increment `TOKEN_ENCRYPTION_KEY_VERSION`, provide the new
  current key, and retain old keys as `TOKEN_ENCRYPTION_KEY_V1`, `_V2`, and so
  on until all stored tokens have been re-encrypted.
- Never log Plaid request/response bodies, authorization headers, transaction
  descriptions, account numbers, or balances.
- The local credentials provider is disabled whenever `NODE_ENV=production`.

## Passkeys

- Production WebAuthn verification must use the exact HTTPS
  `PASSKEY_ORIGIN` and its matching `PASSKEY_RP_ID`.
- Registration requires a discoverable credential and user verification.
  Challenges expire after five minutes and are consumed before verification
  so failed responses cannot be replayed.
- `PASSKEY_BOOTSTRAP_TOKEN` exists only while creating the first owner. Remove
  it from Railway immediately after setup succeeds.
- Recovery codes are random, HMAC-hashed with `AUTH_SECRET`, displayed once,
  and consumed atomically. Regenerating codes invalidates every prior code.
- Never log WebAuthn responses, challenges, bootstrap tokens, or recovery
  codes.

## Authorization

All finance records are owned by a `Household`. Server code derives the active
household from the authenticated user's `HouseholdMember` row; clients do not
choose a household ID. New endpoints must:

1. authenticate using `requireApiHousehold()` or `requireHousehold()`;
2. include `householdId` in every financial record query;
3. reject resources whose stored household differs from the active household;
4. have a negative test covering cross-household access.

`tests/integration/finance-household-isolation.test.ts` exercises the real
Route Handler and Server Action boundaries against two database households.
Its coverage guard inventories finance mutation methods under the Plaid,
transfer, transaction, and budget APIs plus feature Server Actions. A newly
discovered boundary fails the suite until it is covered or is explicitly
classified with a reason. Keep the guard and the boundary test together when
adding a mutation; a helper-only ownership test is not sufficient.

Issue #7 adds manual-account create, update, archive, property/debt link, and
unlink Server Actions to that inventory. The two-household fixture proves a
foreign account cannot receive a valuation or archive, a foreign snapshot
cannot be changed through its account, and cross-household links cannot be
created, read through the scoped Accounts query, or removed.

Household movement reads follow the same boundary even though they add no
mutation endpoint. `getHouseholdMovements` is server-only and requires the
already-authenticated household ID; the Transactions, Budget, and Home pages
derive it from `requireHousehold()`. Transactions, their accounts, transfer
matches, and both transfer legs are independently scoped. Composite database
foreign keys prevent a transfer match from joining legs across households.
Two-household integration fixtures prove foreign transactions, accounts,
matches, and expanded leg metadata do not cross the read boundary.

Transfer suggestions use only unmatched, non-removed transactions and accounts
from the authenticated household. Confirmation re-reads both legs inside the
database transaction and applies the same account, sign, exact minor-unit
amount, currency, date, posted-state, and existing-match checks as suggestion
generation. Foreign IDs remain `404`; duplicate or concurrent confirmation is
a stable `409`. Tie inserts only `TransferMatch`, and household-scoped untie
deletes only that record, so neither operation rewrites source transactions.
The issue #3 mutation-boundary suite continues to exercise the exported POST
and DELETE Route Handlers directly, while the dedicated two-household transfer
suite covers suggestions, policy failures, races, untie, and retie.

## Plaid

- Use Link tokens and exchange public tokens only on the server.
- Persist only normalized transaction fields needed by the product. Never
  store, return, or log raw Plaid transaction payloads.
- Verify every webhook's ES256 JWT, five-minute issue time, and SHA-256 body
  hash before processing it.
- Webhooks enqueue idempotent work and do not perform long synchronization
  inline.
- Removing an Item calls Plaid `/item/remove`, clears the encrypted token, and
  deactivates its local accounts.
- Start in Sandbox, test real institution behavior on Plaid Trial, and complete
  Plaid's company, application, OAuth, and security reviews before production.

## Release checklist

- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Review dependency advisories; do not apply breaking `npm audit --force`
  updates without testing.
- Confirm production has no `AUTH_DEV_BYPASS` value.
- Confirm the passkey relying-party host, HTTPS origin, and Plaid webhook URL.
- Confirm a recent backup and restore drill.
- Confirm logs and error reports contain no financial payloads.
