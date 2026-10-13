# Issue #28 Accounts visual evidence

All captures use the authenticated local PostgreSQL-backed experience. The
representative widths are 1280px and 1920px desktop, 512px practical 200%
reflow, and 390px mobile.

## Files

- `reference-{1280,1920,512,390}.png` — read-only captures of the integrated
  Accounts screen in `prototype/Finance App.dc.html`, the sole visual
  authority.
- `before-{1280,1920,512,390}.png` — the pre-parity implementation at
  `c92bd03`, served from an ignored temporary copy. The fixture has one
  connected cash account, manual investment and property records, and a
  separately stored linked mortgage.
- `after-{1280,1920,512,390}.png` — the parity implementation with a native
  account disclosure expanded and the combined Property row visible.
- `after-expanded-1280.png` — focused account disclosure evidence.
- `after-property-1280.png` — focused combined Property/source-record evidence.
- `after-truth-states-{1280,1920,512,390}.png` — explicit partial balance,
  missing CAD investment and unclassified positions, underwater property,
  unavailable property, mixed-currency and missing linked debt, no-FX, and
  unavailable-history states.

## Local completion status

Implementation and independent review are complete locally and remain pending
CI. Final verification:

- Accounts Vitest: 49 tests passed across 8 files.
- Accounts desktop/mobile Playwright: 2 tests passed.
- Recovery and manual-account accessibility flows: 4 tests passed.
- Phase 7 desktop/mobile audit: 10 tests passed.
- Full orchestrator gate: 214 unit/integration tests and 35 applicable
  desktop/mobile Playwright tests passed; three project skips were intentional.
- Typecheck, lint, format check, production build, and `git diff --check`
  passed.

## Intentional truth-driven adaptations

- Runtime account values, household counts, and the current October 2026
  context replace unsupported prototype-only September values. Test fixtures
  use exact deterministic amounts without presenting them as production data.
- Month navigation remains disabled because historical and future
  account-month views are not sourced.
- Household-wide refresh remains visibly disabled and labelled unavailable;
  real per-connection refresh and recovery remain in the connection section.
- Schedules, projected balances, next-paycheck dates, balance floors,
  reconciliation, and monthly equity movement say unavailable when no source
  exists.
- The fixture is intentionally smaller than the prototype's 15-account
  scenario. It proves grouping, exact arithmetic, a linked property/mortgage,
  and separate source-record maintenance without inventing accounts.
- Unclassified positions remain visible and appear as their own equation term
  when needed to keep net-worth arithmetic exact.
- Currency totals remain separate. No exchange rate or implicit zero is used.
