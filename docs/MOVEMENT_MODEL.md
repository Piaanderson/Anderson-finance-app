# Household movement read model

The movement model is a household-scoped read abstraction over immutable source
`Transaction` rows and reversible `TransferMatch` records. It is derived at
read time; there is no second persisted ledger.

## Identity and counting

- An unmatched transaction has ID `transaction:<transaction-id>`.
- A matched transfer has ID
  `transfer:<outgoing-transaction-id>:<incoming-transaction-id>`.
- Movement IDs depend only on source identity, not query order or a generated
  display value.
- A valid `TransferMatch` produces one movement and retains two legs with their
  original transaction IDs. Tie does not merge, rewrite, or delete either
  transaction. Untie removes the match and the same legs return as two
  independent movements.
- Transfer movements are excluded from income, spending, and category-spending
  calculations. Both source legs remain visible for explanation, not
  double-counted as cash flow.

## Dates, descriptions, and ordering

For a single transaction, the effective display date is `authorizedDate` when
the bank supplies one; otherwise it is the posted `date`.

For a transfer, the canonical date is the outgoing leg's effective display
date. This represents initiation from the source account and avoids changing
the movement date when the receiving institution posts later. Both authorized
and posted dates remain visible on each expanded leg.

Descriptions use the first non-empty value in this order:

1. outgoing leg merchant;
2. outgoing bank-provided original description;
3. outgoing Plaid description/name;
4. incoming leg merchant;
5. incoming bank-provided original description;
6. incoming Plaid description/name.

An unmatched transaction uses the same merchant, bank-description, then Plaid
name priority for its one leg. Expanded transfer detail always shows both
source descriptions, so the canonical label never hides a disagreement.

Movements sort by canonical date descending, then deterministic movement ID
ascending. Pending state is true for a transfer when either leg is pending.

## Amounts, signs, and currencies

`Transaction.amount` keeps Plaid's transaction convention:

- positive means money moved out of that account;
- negative means money moved into that account;
- zero is neutral.

This is intentionally different from `FinancialAccount.currentBalance`, whose
sign is the account's net-worth contribution. Movement code never applies the
account-position sign rule to a transaction.

Arithmetic converts the database's fixed two-decimal values to integer minor
units. It groups totals by an explicit currency identity. ISO, unofficial, and
unknown currency identities are separate; unlike currencies are never added.
A same-currency, equal-value transfer can display one moved amount. A transfer
whose legs differ in value or currency displays both values and still
contributes zero to income and spending.

The current income read is the sum of unmatched negative transaction amounts,
and spending is the sum of unmatched positive amounts. Pending transactions
are included and labelled. Later category semantics may distinguish refunds or
other inflows, but must continue to use this centralized movement arithmetic.

## Transfer suggestions and confirmation

Suggestions are deterministic, household-scoped review candidates over source
transactions that are unmatched and not removed. A pair is eligible only when:

- both source rows and both accounts belong to the authenticated household;
- the legs use different accounts;
- the outgoing Plaid amount is positive and the incoming Plaid amount is
  negative;
- their absolute amounts are exactly equal after parsing the database decimal
  as integer minor units;
- both rows have one known currency identity and those identities are exactly
  equal. ISO, unofficial, and unknown identities are never mixed, and two
  unknown identities are not treated as equal;
- the absolute distance between effective dates is at most seven calendar days,
  inclusive. Effective date means authorized date with posted-date fallback;
  and
- both rows are posted. A pair with either leg still pending is withheld until
  both institutions provide stable posted transactions.

The candidate builder indexes incoming legs by currency identity and absolute
minor-unit amount before applying the date window. It does not perform an
unbounded all-to-all comparison.

Eligible candidates rank by effective-date distance first. Transfer-related
wording in the normalized bank fields adds limited supporting weight, but
wording can never make an otherwise ineligible pair eligible. Ties resolve by
effective date and transaction ID so input or database order cannot change the
result. When the two highest candidates are within ten score points, the
suggestion is marked ambiguous and the user must choose an incoming leg after
inspecting both sides.

A suggestion is not a match. Every candidate carries a
confirmation-required state, and only an explicit user action may create a
`TransferMatch`. Skipping is session review state and does not change source
transactions or create a persisted rejection.

## Tie and untie invariants

`POST /api/transfers` re-reads both household-owned source rows and applies the
same eligibility policy inside the match transaction. It rejects removed,
pending, already matched, same-account, wrong-sign, unequal-amount,
incompatible-currency, and out-of-window legs. A foreign transaction ID remains
a non-enumerating `404`. Unique database constraints arbitrate duplicate or
concurrent confirmation, and the route translates that conflict to the stable
`TRANSFER_MATCH_CONFLICT` `409` response.

Creating a match inserts only `TransferMatch`; it does not update either
`Transaction`. `DELETE /api/transfers/:matchId` is household-scoped and deletes
only that match. Untie therefore restores the same two source rows, and the
same eligible pair can be tied again after an untie. Tests compare the complete
source rows before and after this cycle.

If Plaid later removes one leg of an existing match, the remaining live leg is
eligible for review rather than being trapped by the stale relationship. An
explicit confirmation involving that live leg transactionally deletes the
orphaned match before creating the replacement. The removed transaction stays
unchanged and can never become a candidate.

## Bank fields and balance movement

Synchronization requests Plaid's optional original description and persists
only useful normalized fields:

- bank description;
- merchant and Plaid description/name;
- payment memo/reason and reference number;
- payment channel, transaction code, and check number;
- ISO or unofficial currency identity.

Currents never stores or exposes a raw Plaid response payload.

Current account balances and snapshots are not transaction-aligned running
balances. The expanded transfer view therefore reports balance movement as
unavailable. It may show before/after values only if a future source supplies
transaction-aligned balances or an explicit derivation can be proven; it must
never reverse-engineer them from today's balance.

## Household and historical policy

The authenticated page derives `householdId` from membership. The data-access
layer scopes transactions, accounts, transfer matches, and both transfer legs
to that household. Composite database foreign keys also prevent a
`TransferMatch` from joining legs from different households.

Plaid-removed transactions (`removedAt` set) are excluded. If one transfer leg
is removed, no transfer is constructed and any remaining live leg appears
independently. A disconnected or archived account does not erase a valid,
non-removed historical transaction: it remains in the ledger and is marked as
an inactive source account. Account rows without transactions do not create
movement noise. Archived categories remain historical labels and are not
offered as new review choices.
