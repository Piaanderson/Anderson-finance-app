# Category and merchant-rule model

Categories are household-owned classification records shared by transaction
history, monthly budget allocations, and exact merchant rules. Clients send
only local record IDs and requested changes; every read and mutation derives
the household from authenticated membership.

## Product groups and ordering

The only groups available for new or maintained categories are Needs, Flex,
Savings, and Debt, in that product order. Active categories have a mutable
zero-based `sortOrder` within their group. Moving or reordering changes the
current taxonomy only; it does not rewrite a transaction amount, date, account,
or any other source financial field.

Names are trimmed, Unicode NFKC-normalized, and whitespace-collapsed. Duplicate
checks are case-insensitive across active and archived household categories.
An archived duplicate must be restored or renamed rather than shadowed by a
second category.

Category mutations include the category revision and a hash of every category
revision in the household. They run at Serializable isolation. A stale list or
record returns an explicit conflict and never overwrites a concurrent change.

## Archive and restore

Archive is a soft state:

- existing `Transaction.categoryId` references remain unchanged;
- existing `BudgetAllocation.categoryId`, planned Decimal amount, and
  destination remain unchanged;
- merchant rules remain stored but are paused because Plaid sync and review
  use rules only when their destination category is active;
- archived categories are excluded from new assignments and future month
  copies; and
- existing budget months continue to display the retained allocation with an
  archived-category label.

Restore clears the archive state and places the category at the end of its
group. Preserved rules become active again. No historical record is recreated
or inferred.

## Explicit merge

Merge is intentionally different from archive. It is an explicit
reclassification that migrates source-category dependencies to one active
target and then archives the source in a single Serializable transaction.

- Transactions change only their category foreign key. Their source identity,
  account, date, descriptions, amount, sign, currency, and Plaid fields remain
  unchanged.
- Merchant rules retain their exact keys and move to the target category.
- A source-only monthly allocation moves to the target.
- When both categories have an allocation in the same month, planned Decimal
  amounts are added exactly. A single non-null destination is preserved.
- If both same-month allocations use different non-null destinations, merge is
  rejected before any write. Currents does not guess which movement destination
  is authoritative.

Merge is not automatically reversible. The UI previews dependency counts and
requires explicit confirmation.

## Merchant-rule identity

A merchant rule is deterministic and household-scoped. Its identity is the
exact normalized key:

1. trim;
2. Unicode NFKC normalization;
3. collapse whitespace; and
4. locale-stable lowercase.

Transaction review starts with merchant name and falls back to the Plaid
transaction name, then shows the resulting key in an editable field. Rule
creation is optional. Missing keys cannot create a rule, and a conflicting key
returns an explicit conflict instead of silently replacing another rule.

The Categories page supports create, edit, retarget, and delete with active
grouped searchable category selection. Merchant-rule updates carry
`updatedAt`; stale edits and deletes fail visibly. Plaid synchronization applies
only one exact key whose destination remains active in the same household.
There is no fuzzy, substring, or ambiguous matching path.

## Validation and persistence

All maintenance forms use server validation, associated field errors, polite
completion announcements, and blocking alerts. Database uniqueness and
Serializable retry conflicts are translated into stable user-facing states.
Unexpected persistence failures return generic retry guidance without exposing
financial data or database details.
