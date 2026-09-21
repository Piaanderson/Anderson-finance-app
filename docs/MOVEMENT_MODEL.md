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
