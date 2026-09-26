# Financial account model

`FinancialAccount` is the household-scoped position record for both connected
and manual accounts.

## Source and provider identity

- `PLAID` accounts require `plaidItemId`, `plaidAccountId`, and the raw Plaid
  `type`. Plaid identifiers remain server-only.
- `MANUAL` accounts require neither Plaid identifier and are prohibited from
  storing one.
- The database check constraint enforces those rules independently of
  application code.

## Financial classification

Every account has an explicit product-facing classification:

- `CASH`
- `INVESTED`
- `PROPERTY`
- `DEBT`
- `UNCLASSIFIED`, used only when a provider type cannot be mapped honestly

Plaid `depository`, `investment`, and `credit`/`loan` accounts map to Cash,
Invested, and Debt respectively. Manual account creation chooses one of the
four household classifications. `MANUAL + UNCLASSIFIED` is rejected by both
Server Action validation and a database constraint.

## Balance sign convention

`currentBalance` is the account's signed contribution to household net worth:

- positive values increase net worth;
- negative values reduce net worth;
- debt normally has a negative value;
- an asset overdraft remains negative;
- a liability overpayment becomes positive.

Plaid reports credit and loan balances as the amount owed, so ingestion negates
those values exactly once. Asset signs are retained exactly as Plaid reports
them. In a manual Debt form, the person enters **Amount owed** as a positive
number; server code negates it exactly once before storage. Manual asset forms
accept the economic sign directly so an overdraft can remain negative. Net
worth therefore uses active signed positions with no provider-type branching.

`availableBalance` is not a net-worth position. It retains the provider's raw
availability meaning (for example, available cash or remaining credit) and is
never included in net-worth arithmetic.

Transaction `amount` keeps Plaid's separate transaction convention and is not
changed by this account-position rule: positive is money out and negative is
money in. Transfer counting, canonical dates/descriptions, and currency-aware
cash-flow arithmetic are defined in `docs/MOVEMENT_MODEL.md`.

## Currency policy

- Manual accounts require a recognized uppercase ISO 4217 currency code.
- Plaid's `iso_currency_code` is retained when present. An unofficial provider
  currency is not relabelled as ISO and leaves the position's currency unknown.
- Household arithmetic groups signed positions by currency. Unlike currencies
  are never added together and no implicit exchange rate is applied.
- A known balance with unknown currency, or an unknown balance, makes the
  summary explicitly partial instead of treating the value as zero.

Account and net-worth arithmetic sums `Prisma.Decimal` values and serializes
fixed two-decimal strings. Client floating-point values are never
authoritative for a subtotal, net-worth total, equity value, or manual
valuation write.

## Accounts presentation and reconciliation

The production Accounts read keeps the four product groups in this order:
Cash, Invested, Property, and Debt. Each subtotal is the exact sum of active,
known signed positions in that classification and currency. Property shows its
full sourced value and Debt includes linked mortgages, so the four source
subtotals add directly to net worth without replacing either record with
equity.

`UNCLASSIFIED` Plaid accounts appear in a separate review-needed section. A
known signed position still contributes to net worth and is shown as an
unclassified adjustment in the reconciliation proof; it is never hidden or
forced into a four-group subtotal. The household can assign one of the four
classifications. When Plaid continues to return an unknown provider type, a
saved classification is retained on later syncs. A later recognized provider
type remains authoritative.

Missing balances and currencies make the affected subtotal and net worth
partial. Unlike currencies produce separate subtotals and net-worth totals.
The reconciliation proof is shown only when every active position has a known
balance and ISO currency.

## Position snapshots

`AccountPositionSnapshot` is the append-safe history of observed signed
positions for Plaid and manual accounts.

- `effectiveAt` is the value's as-of timestamp. Plaid uses the account-sync
  observation time. Manual date-only input is stored at 12:00 UTC so a browser
  time zone cannot move it to another day.
- `observedAt` records when Currents stored the observation. For multiple
  changes with the same effective date, the latest observation wins.
- `source` distinguishes `PLAID_SYNC` from `MANUAL`.
- A deterministic dedupe key makes exact retries idempotent. Plaid also skips a
  new row when its latest observed balance and currency are unchanged. A value
  that changes and later returns to an earlier amount is still recorded.
- Updating `FinancialAccount.currentBalance` and appending/selecting its latest
  snapshot occur in one database transaction.
- A backdated manual valuation is retained without replacing a newer current
  position.
- The migration creates no snapshots for pre-existing balances because their
  true as-of timestamps are unknown. History starts with the first real
  post-migration sync or manual valuation.
- History queries return only actual observations in the requested period.
  They do not invent empty months or reconstruct unobserved balances.

The “Net worth, last 8 months” view derives a point only at a real
`AccountPositionSnapshot.effectiveAt` observation. It may carry forward an
earlier real observation as the latest known position, but it does not create
monthly points, interpolate, or reconstruct balances from transactions. A
point is emitted only after every currently active account has a known
single-currency observation. The chart requires at least two complete points
in one currency; otherwise it explains why history is unavailable. This
strict policy means newly observed, missing, and multi-currency positions
delay the chart instead of producing a misleading trend.

## Archive policy

Manual accounts are soft archived with `isActive = false` and `archivedAt`.
Archived positions are excluded from current account lists and net-worth
arithmetic. Their account row and snapshots remain. Currents exposes no
destructive manual-account deletion.

## Property and debt relationships

`PropertyDebtLink` associates one active Property account with one or more
active Debt accounts in the same authenticated household. Server mutations
scope and validate both sides; self-links, cross-household links, and accounts
with the wrong classifications are rejected.

Property and debt remain separate source records. Derived equity is the
property's signed position plus the linked debts' signed positions, and is
shown only when every included position has a balance in the same currency.
The relationship never combines source balances, so equity reconciles to the
same household net-worth arithmetic.

The Accounts UI labels property value and current positions as sourced,
equity as derived, provider availability as excluded from net worth, and
projection as unavailable because Currents has no supported future-position
model. No estimated value is presented as sourced.

## Budget destinations

`BudgetAllocation.destinationAccount` is an optional relation to
`FinancialAccount`. Deleting the destination clears the allocation reference
instead of deleting the budget allocation.
