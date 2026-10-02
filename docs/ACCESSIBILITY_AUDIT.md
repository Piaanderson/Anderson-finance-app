# Phase 7 responsive and accessibility audit

Audit date: 2026-09-27

Scope: every private-v1 user-facing route, the authenticated shell, reusable
controls, and the important populated, expanded, empty, unavailable, pending,
validation-error, success, and stale-revision states represented by the browser
fixtures.

## Evidence method

Automated evidence and direct inspection are reported separately:

- `tests/e2e/phase-7-audit.spec.ts` runs axe with the WCAG 2.1 A/AA tags on
  every public and authenticated route in the desktop Chromium and mobile
  projects. It also checks one `h1`, heading progression, unique page titles,
  skip-link focus, horizontal reflow, visible control sizes, bottom-navigation
  clearance, reduced-motion computed styles, and the absence of
  Plaid-hosted requests.
- `tests/e2e/accessibility.spec.ts`, `accounts-experience.spec.ts`, and
  `home-dashboard.spec.ts` exercise the populated and non-happy-path states:
  recovery, manual-account validation, unavailable Plaid, valuation and
  property linking, archive, transfer tie/untie, grouped category assignment,
  merchant rules, budget validation and stale-revision conflict, empty states,
  passkey and recovery-code flows, chart summaries, and incomplete-data
  fallbacks.
- Direct browser inspection used real Chromium rendering and keyboard input,
  but was agent-driven rather than a human screen-reader session. It covered
  320, 375, 390, 412, 512 (1024 at 200% reflow), 768, 1024, 1280, 1440, and
  1920 CSS pixels. The limitation is recorded below rather than being described
  as a manual assistive-technology certification.

## Shared shell and reusable surfaces

- Automated WCAG: the shell is included in every authenticated axe scan.
- Keyboard and focus: the skip link is the first focusable control, becomes
  visibly focused, and moves focus to the `tabindex="-1"` main landmark. Native
  links, buttons, inputs, selects, and summaries preserve normal tab order.
- Semantics and ARIA: `nav` and `main` landmarks, list-based navigation,
  `aria-current`, native disclosures, labelled inputs, and minimal live regions
  are retained. Custom transaction disclosures expose `aria-expanded` and
  `aria-controls`; native `details` elements supply their state without
  duplicate ARIA.
- Announcements: blocking failures use alerts; progress and successful,
  canceled, or noncritical state changes use polite status regions. The shared
  authenticated loading boundary exposes `aria-busy` and a polite status
  without introducing a second `h1` while the destination streams alongside
  the current route.
- Touch and pointer: shared buttons and form controls have a 44px minimum;
  listbox options use 48px rows. Hover, active, disabled, busy, selected, and
  focus-visible styles have non-color cues or accompanying text.
- Responsive: the sidebar becomes a safe-area-aware bottom navigation. Below
  600px it becomes a legible 3-by-2 grid and the content reserve increases so
  the navigation cannot cover the final control.
- Reduced motion: the global reduced-motion rule reduces animation and
  transition durations to 0.01ms, disables repeated animation, and removes
  smooth scrolling.
- Remaining risk: safe-area insets are verified through CSS and emulation, not
  on every physical notched device.

## Sign in

- Automated WCAG: desktop and mobile axe scans include the default and invalid
  recovery-code state.
- Keyboard and focus: passkey, recovery disclosure, recovery input, submit, and
  setup link use native controls in visual order.
- Semantics, forms, and announcements: the recovery input has a label and help
  text; an invalid code sets `aria-invalid`, adds the alert to
  `aria-describedby`, and announces the blocking error.
- Touch and responsive: controls pass the 44px and overflow checks at all audit
  widths.
- Reduced motion: disclosure reveal collapses to 0.01ms.
- Remaining risk: the OS passkey prompt is platform UI and is outside DOM/axe
  inspection.

## Owner setup

- Automated WCAG: desktop and mobile axe scans cover the available setup form.
- Keyboard and focus: all fields and the submit action are native and ordered
  by the document.
- Semantics, forms, and announcements: every field is labelled; setup-code
  failures are associated with the code field and announced as alerts. Busy,
  created, copied, and clipboard-failure states are exposed.
- Touch and responsive: the form reflows without clipping and all controls meet
  the target-size check.
- Reduced motion: no operation is delayed by animation.
- Remaining risk: successful WebAuthn registration depends on platform
  authenticators; the Chromium ceremony is covered separately.

## Home

- Automated WCAG: axe covers the empty household route and the populated,
  comparison, incomplete-data, and unavailable states in
  `home-dashboard.spec.ts`.
- Keyboard and focus: month navigation, account links, and movement
  disclosures are keyboard operable with visible focus.
- Semantics and graphics: one `h1`, nested sections, labelled figures,
  descriptive chart names, visible summary text, and ordered-list data
  fallbacks remain available without the SVG.
- Status and color: positive/negative movement, unavailable comparisons, budget
  allocation, and obligations all include text; no interpretation depends on
  hue alone.
- Touch and responsive: summary columns stack, long labels wrap, charts remain
  bounded, and navigation does not obscure content.
- Reduced motion: chart-line and allocation changes are restrained and removed
  under reduced motion.
- Remaining risk: no remaining route-specific issue found.

## Budget

- Automated WCAG: axe covers the empty and populated budget, validation error,
  successful save, category allocation, duplicate destination warning,
  previous-plan copy, and stale-revision conflict states.
- Keyboard and focus: month links, income edit, allocation inputs, account
  selects, and save actions are fully operable; validation and conflict return
  focus to the affected income control.
- Semantics, forms, and announcements: the summary and four category regions
  retain honest moved/due values. Labels, help, `aria-invalid`,
  `aria-describedby`, alert, and status associations are tested.
- Touch and responsive: paired allocation rows become a single-column sequence
  without changing reading order or dropping planned, destination, balance,
  date, progress, or action information.
- Reduced motion: bar and progress changes use short transitions; reduced
  motion resolves them immediately.
- Remaining risk: no remaining route-specific issue found.

## Accounts

- Automated WCAG: axe covers grouped positions, no-history, incomplete-history,
  unavailable connection, recovery, manual account, valuation, property-link,
  archive, and expanded detail states.
- Keyboard and focus: connection actions, row disclosures, manual forms,
  linking, and archive controls use native keyboard behavior and visible focus.
- Semantics, forms, and announcements: account groups and rows retain labelled
  balance, currency, as-of, connection, and availability text. Blocking
  connection failures are alerts; connection progress and cancellation are
  polite statuses.
- Graphics: net-worth history has a title, description, visible summary, and
  date/value list fallback.
- Touch and responsive: dense rows reflow while preserving labels, balances,
  dates, connection state, and actions; long institution/account names wrap.
- Reduced motion: history and details reveal immediately when reduced motion is
  requested.
- Remaining risk: the external Plaid-hosted Link interface is intentionally
  mocked/blocked and is not part of this application audit.

## Transactions

- Automated WCAG: axe covers empty, transfer review, expanded two-leg movement,
  unmatched/tied/untied, category review, merchant-rule, success, and stale
  conflict states.
- Keyboard and focus: disclosures, transfer candidates, tie/untie actions, and
  the grouped category combobox support keyboard operation. Synthesized click
  activation is accepted for assistive technology while pointer-down only
  preserves combobox focus.
- Semantics and announcements: transaction lists, movement headings, raw bank
  data, leg labels, balance movement, review state, alerts, and statuses remain
  explicit. The empty review heading is correctly nested.
- Touch and responsive: movement rows and leg grids stack without losing
  merchant, account, date, amount, category, or action text.
- Reduced motion: transfer detail and review reveals are short and become
  immediate in reduced-motion mode.
- Remaining risk: no remaining route-specific issue found.

## Categories

- Automated WCAG: axe covers grouped category assignment, search/no-results,
  exact merchant rules, add, rename, move, reorder, archive, restore, validation
  error, success, and stale conflict states.
- Keyboard and focus: combobox arrows, Enter, Escape, and touch/click activation
  are tested; category reorder has explicit keyboard buttons.
- Semantics, forms, and announcements: Needs, Flex, Savings, and Debt retain
  visible group labels. Inputs are labelled and errors/status changes are
  associated and announced.
- Touch and responsive: listbox options are at least 48px; maintenance action
  groups stack to full-width controls on narrow screens; long category and
  merchant names wrap.
- Reduced motion: list/detail reveals resolve immediately when requested.
- Remaining risk: no remaining route-specific issue found.

## Security settings

- Automated WCAG: axe covers the route and passkey/recovery-code workflow; the
  page now has a route-specific title.
- Keyboard and focus: named passkey removal, passkey creation, recovery-code
  regeneration, copying, and navigation use native controls.
- Semantics, forms, and announcements: removal actions have specific accessible
  names. Busy state, success, clipboard errors, and operation failures are
  exposed without color-only meaning.
- Touch and responsive: credential rows stack at narrow widths and every action
  meets the target-size check.
- Reduced motion: the surface has no interaction-blocking motion.
- Remaining risk: passkey browser automation remains Chromium-only by design;
  the expected duplicate mobile ceremony is skipped.
- Issue #18 revalidation: after adding a passkey, generating recovery codes,
  signing in with the passkey, and consuming one recovery code, the populated
  Security route now receives its own WCAG 2.1 A/AA axe scan. The focused
  Chromium ceremony and scan passed on 2026-10-01.

## Motion and contrast decisions

- Added motion only to disclosure/content reveal, transfer detail, chart-line
  introduction, allocation/progress changes, and short button feedback.
- No count-up, shake, overshoot, parallax, flashing, smooth-scroll dependency,
  or delayed content access was introduced.
- The focus indicator remains 2px and visible. Meaningful controls and graphics
  now use border tokens that exceed 3:1 against both background and surface;
  axe validates rendered text contrast at A/AA.
- Allocation/chart segments have boundaries and visible text/data equivalents,
  so category or financial state is not communicated by color alone.

## Verification and limitations

Exact command results are recorded in `docs/IMPLEMENTATION_PLAN.md`.

The audit does not claim a human VoiceOver, NVDA, JAWS, TalkBack, or physical
device certification. Axe cannot prove usability, and browser emulation cannot
reproduce every font, safe-area, browser-chrome, or platform-authenticator
combination. These are residual acceptance risks, not known WCAG failures.

Issue #18 also updates both CI definitions to run the complete desktop and
mobile Playwright projects instead of Chromium desktop alone. The production
dependency audit and formatting check are merge-gating alongside those browser
checks after the issue #18 changes are published.
