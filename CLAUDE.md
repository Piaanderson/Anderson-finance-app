# Finance app project notes

## Canonical integrated visual reference

- `prototype/Finance App.dc.html` is the exact final visual reference for the
  shared shell and the Home, Budget, Accounts, and Transactions pages.
- Files named `* Directions.dc.html` preserve historical ideation and explain
  interaction provenance; do not select, recombine, or substitute options from
  them when implementing visual parity.
- Categories uses the separately approved direction in
  `prototype/Categories.html`; the integrated prototype's Categories
  placeholder is not authoritative.

## Confirmed keepers (Pia, turn 1 review)

1. **Expanded-row detail** — a transfer shown as ONE transaction, expandable to reveal the two legs, including balance movement (−$3,260 → −$2,860). Core pattern.
2. **Shared app rail** — use the integrated `Finance App.dc.html` navigation
   rail and net-worth footer. The earlier grouped account-list sidebar is not
   part of the final integrated shell. Any net-worth chart remains labelled
   “Net worth, last 8 months” and keeps a text alternative.
3. **"Where it goes" summary** placed adjacent to the stacked allocation bar.
4. **Income + left-to-budget header + stacked allocation bar.**

## Confirmed keepers (Pia, turn 2 review)

5. **The integrated paired-column row pattern** places the budget field left,
   arrow/wire center, and destination account plus balance/date expected right.
   Use it for every section down the page.
6. **The integrated summary header** reads “Budget · September 2026 / income
   $8,240 · day 12,” with Left to budget at right, the stacked bar, and the
   four-stat summary.
7. **Summary stats read as "moved / due"**, never "$X of $Y" — the "of" total is already in the bar. Applied to all three options.
8. **Flex categories are structured like the other sections** — each has a planned amount, current spent, and a bar showing remaining or over. Section header keeps the available amount visually prominent.

## Confirmed keepers (Transactions thread)

The integrated Transactions screen in `prototype/Finance App.dc.html` is
authoritative and includes these retained interactions: 9. **Ledger with the
unmatched-legs tie** — one row per movement, with loose legs surfaced for
tying. 10. **Expanded two-leg detail** — both legs plus balance movement, with
the bank's raw description, memo, and reference shown verbatim. 11. **Review
card, stacked transfers-first then categories** — keyboard-driven; both panels
disappear when nothing is left to answer. 12. **Plain statement of a wrong
auto-match** — untie splits it back into two honest single-account rows.

## Confirmed keepers (Category review)

13. **Grouped searchable picker** — Needs, Flex, Savings, and Debt stay in
    product order. The combobox supports keyboard and touch assignment.
14. **Merchant rules are explicit** — an exact normalized merchant key is
    visible, optional, and editable during assignment; rules never rely on a
    hidden fuzzy match.

## Confirmed keeper (Home)

15. **The Home screen in `prototype/Finance App.dc.html` is authoritative.**
    Its exact integrated layout supersedes the Turn 4 option labels in
    `prototype/Finance App Directions.dc.html`.
16. **Keep the prototype's header and two-column desktop composition.** The
    header contains month navigation, month context, Today, the comparison
    control, and the full-width month-pace bar. The wider left column contains
    Net worth, Cash flow, Spending by category, and Recent activity. The right
    column contains This month's plan, Next 14 days, Debt, Goal accounts, and
    the account rollup, in that order.
17. **Keep the prototype's card treatments and interactions.** Preserve the
    assets/debt summary, current and comparison net-worth lines, three cash-flow
    metrics and bars, category bars with comparison deltas, expandable one-row
    transfer, linked Budget card, compact obligation/debt/goal cards, spacing,
    typography, borders, and accent hierarchy shown in the integrated screen.
18. **Fit production truth into those exact surfaces.** Current calculations
    and source periods remain authoritative. Unsupported comparison bases,
    prior-year history, upcoming schedules, checking-coverage claims,
    debt-free dates, or goal targets show explicit unavailable copy in their
    intended card rather than being removed, fabricated, or replaced with a
    different layout. Empty, partial, pending, incomplete-history,
    unclassified, archived, and multi-currency states remain explicit; no
    value is silently treated as zero and no FX is implied.
19. **Responsive and accessible adaptations preserve the integrated
    hierarchy.** Desktop keeps the prototype's roughly 1.45/1 two-column grid;
    mobile uses the same DOM, reading, and focus order in one column. Preserve
    labelled chart summaries and data fallbacks, one `h1`, logical headings,
    native controls, visible focus, keyboard operation, 44-by-44-pixel targets,
    non-color status text, WCAG 2.1 AA contrast, and no horizontal page scroll.
    Reproduce the prototype's short bar, value, chart, disclosure, and page
    transitions; reduced motion resolves at no more than 0.01 ms.

## Confirmed keeper (Accounts)

20. **The Accounts screen in `prototype/Finance App.dc.html` is the
    authoritative visual direction.** Reproduce that integrated screen rather
    than selecting or recombining options from
    `prototype/Accounts Directions.dc.html`; those options are historical
    ideation only.
21. **Keep the prototype's exact desktop hierarchy.** The header has month
    navigation, month context, account count, Today, Refresh all, Add account,
    and the connected/manual/status line. The account ledger uses the five
    columns Account, Connection, Balance today, Before month end, and Projected.
    Cash, Invested, and Debt use compact grouped rows with section totals and
    add-account links; Property follows as the combined home-equity row; the
    page ends with the full net-worth equation and total.
22. **Keep the prototype's expanded-row composition.** Opening an account
    reveals Scheduled before month end beside Its role in the budget, including
    the ending-balance bridge, projected-by-next-paycheck treatment, floor
    meter and explanation, and Reconcile, Rename, and See in Transactions
    actions. Preserve the prototype's density, borders, accent edge, spacing,
    typography, and 240 ms reveal rather than substituting the current
    production card stack.
23. **Keep the prototype's property treatment.** The home and Rocket Mortgage
    read as one visual line with estimated value, owed/equity bar, mortgage
    context, equity today, and monthly equity movement. Underlying property and
    debt remain separate source records so the displayed net-worth equation
    stays traceable.
24. **Fit complete production behavior into the approved visual without
    changing its primary layout.** Connection recovery, manual account and
    valuation maintenance, property/debt linking, classification remediation,
    partial and multi-currency totals, unavailable values, and the labelled
    snapshot history remain available through honest states, disclosures, or
    secondary maintenance surfaces. Unsupported projections or schedules show
    explicit unavailable copy in their intended cells/panels until production
    has sourced behavior; never fabricate a number, date, exchange rate, or
    zero.
25. **Responsive and accessible adaptations preserve the same information
    hierarchy.** The five-column ledger remains the desktop target; tablet and
    mobile turn each row into a labelled stack in the same DOM, reading, and
    focus order with no horizontal page scroll. Use semantic headings, native
    disclosure and action controls, visible focus, keyboard operation,
    44-by-44-pixel targets, non-color status text, live status/error
    announcements, chart alternatives, WCAG 2.1 AA contrast, and inputs of at
    least 16 px on mobile. Motion may reproduce the prototype's short page,
    row-reveal, hover, and meter transitions; reduced motion resolves at no
    more than 0.01 ms.

## Confirmed keeper (Categories)

26. **`prototype/Categories.html` is the authoritative Categories maintenance
    direction.** Use its single selected grouped-table and inspector
    composition; the retired 1a/1b alternatives are not implementation choices.
27. **Keep Planned and Spent visible in the grouped category table.** Desktop
    keeps the inspector beside the Needs, Flex, Savings, and Debt groups;
    selecting a category exposes rename, move, reorder, archive, merge, and
    exact merchant-rule maintenance without turning every row into a form.
28. **Color belongs to the four product groups, not individual categories.**
    Category spending combines categorized activity across all household
    accounts; a category is never presented as belonging to an account.
29. **Preserve the complete existing maintenance model.** Create, rename,
    move, explicit up/down reorder, archive, restore, merge, validation,
    concurrent-edit conflicts, empty states, destructive confirmations, and
    rule create/edit/retarget/delete remain represented. Merge never guesses
    through a budget-plan conflict.
30. **Reuse the integrated Transactions grouped searchable picker and exact
    merchant-key treatment.** Needs, Flex, Savings, and Debt remain in product
    order; search, selection, no-results, keyboard, and touch behavior are
    shared rather than reimplemented.
31. **Responsive adaptations preserve the grouped table's information.** Wide
    layouts cap the workspace and retain the inspector; desktop remains
    side-by-side; tablet opens the inspector as a right sheet; mobile uses a
    single column and full-screen inspector with Planned and Spent stacked in
    each row. Keep visible focus, keyboard operation, 44-by-44-pixel targets,
    16 px mobile inputs, explicit text errors, WCAG 2.1 AA contrast, no
    horizontal page scroll, and reduced motion at no more than 0.01 ms.

## Page set (Pia)

Home · Budget · Accounts · Transactions use the exact integrated screens in
`prototype/Finance App.dc.html`. Categories uses
`prototype/Categories.html`.

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
