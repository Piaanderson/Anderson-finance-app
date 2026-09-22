# Finance app project notes

## Confirmed keepers (Pia, turn 1 review)

1. **Expanded-row detail** — a transfer shown as ONE transaction, expandable to reveal the two legs, including balance movement (−$3,260 → −$2,860). Core pattern.
2. **Accounts sidebar** — grouped account list (Cash / Invested / Property / Debt). Sparkline must be labelled ("Net worth, last 8 months") or dropped.
3. **"Where it goes" summary** placed adjacent to the stacked allocation bar.
4. **Income + left-to-budget header + stacked allocation bar.**

## Confirmed keepers (Pia, turn 2 review)

5. **2a paired-column row pattern wins** for budget categories — budget field left, arrow/wire, destination account + balance/date expected right. Use this for every section down the page.
6. **2c summary header wins** — "Budget · September 2026 / income $8,240 · day 12" with Left to budget at right, stacked bar plus the four-stat summary.
7. **Summary stats read as "moved / due"**, never "$X of $Y" — the "of" total is already in the bar. Applied to all three options.
8. **Flex categories are structured like the other sections** — each has a planned amount, current spent, and a bar showing remaining or over. Section header keeps the available amount visually prominent.

## Confirmed keepers (Transactions thread)

Built in `prototype/Transactions Directions.dc.html`. Turn 1 offered 1a–1c; **2a is the version to keep** and combines the four pieces Pia kept: 9. **Ledger with the unmatched-legs tie** (from 1a) — one row per movement, loose legs surfaced for tying. 10. **Expanded two-leg detail** (from 1a) — same pattern as the budget page's transfer row: both legs plus balance movement, and the bank's raw description/memo/ref shown verbatim. 11. **Review card, stacked transfers-first then categories** (from 1b) — keyboard-driven; both panels disappear when nothing is left to answer. 12. **Plain statement of a wrong auto-match** (from 1c) — untie splits it back into two honest single-account rows.

## Confirmed keepers (Category review)

13. **Grouped searchable picker** — Needs, Flex, Savings, and Debt stay in
    product order. The combobox supports keyboard and touch assignment.
14. **Merchant rules are explicit** — an exact normalized merchant key is
    visible, optional, and editable during assignment; rules never rely on a
    hidden fuzzy match.

## Page set (Pia)

Home dashboard · Budget (done — `prototype/Finance App Directions.dc.html`) · Accounts · Transactions (done — `prototype/Transactions Directions.dc.html`) · Categories.

## Shared scenario (keep identical on every page)

September 2026, day 12 of 30, income $8,240. Net worth $177,860 (+$3,412 this month).

- Cash: Wells Fargo Checking, Capital One Checking, Ally Checking, Wells Fargo Savings, CapOne · Vacation, HOA + birthdays savings
- Invested: Schwab Roth ($18,920 after the Sep 5 $500 contribution)
- Property: home (value paired with the mortgage row)
- Debt: Chase card (−$2,860 after the Sep 8 $400 payment), Capital One card (−$1,240), Citi · everyday, Citi · travel, BofA camper loan, WF line of credit / Wells Fargo PLOC (−$2,150), Rocket Mortgage (−$287,400)
  Category sections: Needs · Flex · Savings · Debt (see the FLEX/NEEDS/SAVINGS/DEBT arrays in the transactions file).

## Shared parts

- Production navigation lives in `src/components/shell/app-sidebar.tsx`; the shared authenticated shell lives in `src/app/(app)/layout.tsx`.
- Direction files use canvas mode, newest turn as the top `<section>`, `{turn}{letter}` id badges on each option wrapper.

## Open

- Mortgage: payment sits in Needs, with owed + home value chips on the same row. Confirmed approach, not yet challenged.
- Animations/delight still deferred across all pages — note intended motion per option.

## Standing constraints

- Dark mode only. Production tokens live in `src/styles/nocturne.css`; the original design-system bundle remains under `prototype/_ds/`.
- Animations and delightful interactions are a priority, deferred until a direction is chosen; note intended motion on each option.
- Placeholder figures fine; keep the same September 2026 scenario across all options ($8,240 income, day 12 of 30).

## Production application

- The `.dc.html` files and their runtime/design system are preserved under `prototype/` as read-only design references.
- Production is Next.js App Router + TypeScript + Prisma/PostgreSQL + Auth.js + Plaid.
- Every finance record is household-scoped. Never accept a household ID from the client; derive it from the authenticated membership.
- Plaid access tokens stay server-only and encrypted. Webhooks must be signature-verified and enqueue idempotent sync work.
- Railway service setup and recovery procedures are in `docs/RAILWAY.md`; security requirements are in `docs/SECURITY.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
