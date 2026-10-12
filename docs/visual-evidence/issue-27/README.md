# Issue #27 Budget visual evidence

Authoritative reference: `prototype/Finance App.dc.html`, Budget screen.

Captured from the authenticated, database-backed Budget Playwright fixture:

- `budget-after-1280.png`
- `budget-after-1920.png`
- `budget-after-512.png`
- `budget-after-390.png`

The fixture includes all four sections, mortgage property context,
uncategorized review, an over-budget Flex row, and expanded truthful movement
evidence. Debt and Savings show both legs of matched transfers only when the
saved destination uniquely proves the association. Needs shows its categorized
source transaction separately; changing a destination without saving cannot
change that evidence. Reused destinations are labelled ambiguous instead of
being attributed to a single allocation.

Screenshots are captured from the clean persisted plan before the test changes
any destination selection. The mortgage therefore remains paired with the
stored mortgage account and property context, with no unsaved reuse warning.

The transfer disclosures intentionally say that a before/after balance bridge
is unavailable. The production movement source contains the transaction legs
and current account balance, but no historical pre-movement balance snapshot.

Movement panels use native `details`/`summary`. Their bounded monthly content
remains in the DOM while closed so server-rendered disclosure semantics,
keyboard behavior, and browser-managed open state do not depend on per-row
hydration state. Conditionally mounting each panel would add fragile client
state and would make disclosure content unavailable before hydration.

No before screenshot is included. The pre-change checkout did not have a stable
authenticated fixture available in this isolated worktree, and recreating it
after implementation would not be an honest before capture. The preserved
prototype HTML remains the exact visual reference; it was not edited.
