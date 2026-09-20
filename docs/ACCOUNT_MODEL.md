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
four household classifications; manual CRUD is delivered separately.

## Balance sign convention

`currentBalance` is the account's signed contribution to household net worth:

- positive values increase net worth;
- negative values reduce net worth;
- debt normally has a negative value;
- an asset overdraft remains negative;
- a liability overpayment becomes positive.

Plaid reports credit and loan balances as the amount owed, so ingestion negates
those values exactly once. Asset signs are retained exactly as Plaid reports
them. Manual values use the signed-position convention directly. Net worth is
therefore the sum of active account `currentBalance` values with no provider-
type branching.

`availableBalance` is not a net-worth position. It retains the provider's raw
availability meaning (for example, available cash or remaining credit) and is
never included in net-worth arithmetic.

Transaction `amount` keeps Plaid's separate transaction convention and is not
changed by this account-position rule.

## Budget destinations

`BudgetAllocation.destinationAccount` is an optional relation to
`FinancialAccount`. Deleting the destination clears the allocation reference
instead of deleting the budget allocation.
