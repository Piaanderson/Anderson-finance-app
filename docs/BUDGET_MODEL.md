# Monthly budget calculation model

The monthly budget is a household-scoped plan reconciled against the movement
read model. `BudgetMonth` stores one manual income plan for a canonical UTC
calendar month. `BudgetAllocation` stores one planned amount per category and
an optional destination account.

## Month identity and navigation

- A URL month uses `YYYY-MM`; persistence uses the first day of that month at
  `00:00:00.000Z`.
- Previous and next controls shift exactly one calendar month in UTC, including
  year boundaries.
- An invalid or absent URL month falls back to the current UTC month.
- Reads and copy mutations derive the household from authenticated membership;
  the client never sends a household ID.

## Fixed-point calculations

All formulas parse two-decimal database values into integer minor units. No
budget total is calculated with floating-point arithmetic.

- `total planned = sum(all allocation plans)`
- `left to budget = manual income plan − total planned`
- `observed income = unmatched, uncategorized USD inflows`
- `unassigned spending = uncategorized USD outflows`

The income plan is intentionally manual. Plaid does not supply a reliable
household-specific definition of expected monthly income, so observed income is
shown beside the plan rather than silently replacing it.

Currents v1 budgets are USD plans. Non-USD, unofficial-currency, and
unknown-currency movements remain in the ledger but are excluded from USD
budget arithmetic.

## Spending, refunds, and transfers

Needs and Flex activity comes from categorized transaction movements:

- an outflow increases category activity;
- a categorized inflow is treated as a refund and decreases category activity;
- spending in a category without a monthly allocation is surfaced separately;
- pending transaction movements follow the movement model and are included;
  and
- transfer movements never count as spending.

Debt and Savings activity is money **moved** to each allocation's destination
account. It comes only from the incoming leg of a matched USD transfer in the
selected month. If multiple allocations share a destination, the account's
transfer pool is distributed once in stable budget order and is never
duplicated. Earlier rows receive up to their plan; the last row receives any
remaining overage.

For each row:

- `remaining = max(planned − activity, 0)`
- `over = max(activity − planned, 0)`

The section totals are sums of the displayed rows, so the allocation bar,
Where it goes summary, section headings, and row statuses reconcile to the same
calculation.

## Copying the previous month

Copy creates only the immediately following calendar month and never
overwrites an existing plan. Income and planned amounts copy exactly.

- Active household categories are copied.
- Archived categories are omitted from the new draft.
- A destination is retained only while the account is active, unarchived, and
  owned by the same household; otherwise the copied allocation has no
  destination.
- The source month is unchanged.
- The unique household/month database constraint arbitrates concurrent copies;
  one succeeds and the other receives a stable conflict response.
