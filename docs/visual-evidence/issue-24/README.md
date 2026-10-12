# Issue #24 visual evidence

Captured on October 12, 2026 from the production Transactions route with an
isolated, database-backed Playwright household fixture. The fixture uses three
September 2026 source transactions across checking and card accounts. API
mutations were persisted before each after-state capture; test cleanup ran only
after the screenshots were written.

## Clean after states

- `transactions-after-1280.png`
- `transactions-after-1920.png`
- `transactions-after-512.png`
- `transactions-after-390.png`

These captures have no drawer or row disclosure open. Both review queues are
truthfully empty after the fixture verifies untie category preservation and
then ties the two source transactions again. Mobile captures use the production
bottom-navigation clearance and normalize fixed chrome into its document
position so it does not obscure ledger controls.

## Representative interaction states

- `transactions-review-1280.png` — transfers-first review with category review
  beneath it.
- `transactions-expanded-1280.png` — one transfer expanded to its two source
  legs.
- `transactions-drawer-1280.png` — native modal detail drawer with bank fields
  and explicit merchant-rule outcome controls plus unsupported user-field
  copy. This is a 1280 × 1080 viewport-aligned capture so the fixed drawer
  heading and upper content remain in their production viewport positions.
- `transactions-zero-work-1280.png` — truthful zero-work state after both
  review queues independently disappear.

No before screenshot is included. A pre-implementation capture was not made,
so creating one after the fact would not be factual.
