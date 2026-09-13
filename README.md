# Currents — personal finance app

Dark-mode budgeting app prototype. Plan a month across real accounts, and see
debt paydowns and savings transfers as single tied movements rather than two
unlinked transactions.

## Files

| File | What it is |
| --- | --- |
| `Finance App.dc.html` | The working prototype — Home, Budget, Transactions, Accounts |
| `Finance App Directions.dc.html` | Design exploration canvas: budget + home layout options (turns 1–4) |
| `Transactions Directions.dc.html` | Transactions page options |
| `Accounts Directions.dc.html` | Accounts page options |
| `CLAUDE.md` | Project notes: confirmed design decisions, scenario data, constraints |
| `_ds/nocturne-*/` | Nocturne design system (tokens, components, bundle) |
| `support.js` | Design Component runtime |

Open any `.dc.html` file directly in a browser.

## Conventions

- Dark mode only. All colour, type and spacing comes from Nocturne `var(--*)`
  tokens — no raw hex values in page source.
- Phosphor icons for all interface chrome.
- Buttons and toggles at 8px radius; 999px reserved for filter chips and tags.
- Every page shares one header: month stepper, scenario kicker, title, then
  page-specific controls.
- Shared scenario across all pages: September 2026, day 12 of 30, income $8,240,
  net worth $177,860.

## Not built yet

- Categories page (create, edit, regroup, move between sections)
- Animation polish beyond the current interaction set
