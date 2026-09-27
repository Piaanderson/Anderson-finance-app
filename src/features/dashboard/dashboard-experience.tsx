import type { CSSProperties } from "react";
import Link from "next/link";
import { NetWorthHistory } from "@/features/accounts/net-worth-history";
import { TransactionRow } from "@/features/transactions/transaction-row";
import { formatDecimalCurrency, formatMovementAmount } from "@/lib/money";
import type {
  DashboardBudgetMovement,
  FixedPointChange
} from "./dashboard-domain";
import type { HouseholdDashboard } from "./dashboard-data";

const positionGroups = [
  { key: "CASH", label: "Cash" },
  { key: "INVESTED", label: "Invested" },
  { key: "PROPERTY", label: "Property" },
  { key: "DEBT", label: "Debt" }
] as const;

const snapshotDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

function currencyIdentity(currency: {
  kind: "ISO" | "UNOFFICIAL" | "UNKNOWN";
  code: string | null;
}) {
  if (currency.kind === "ISO") return currency.code ?? "ISO currency";
  if (currency.kind === "UNOFFICIAL") {
    return `${currency.code ?? "Unknown"} unofficial currency`;
  }
  return "Currency unavailable";
}

function ChangeText({
  change,
  currency,
  unavailableLabel = "Comparison unavailable"
}: {
  change: FixedPointChange;
  currency: { kind: "ISO" | "UNOFFICIAL" | "UNKNOWN"; code: string | null };
  unavailableLabel?: string;
}) {
  if (change.status === "unavailable") {
    return <span className="muted">{unavailableLabel}</span>;
  }
  const amount = formatMovementAmount(change.absoluteValue, currency);
  return (
    <span>
      {change.direction === "unchanged"
        ? `No change from ${amount}`
        : `${amount} ${change.direction === "increase" ? "more" : "less"}`}
    </span>
  );
}

function BudgetMovementValue({
  label,
  value
}: {
  label: string;
  value: DashboardBudgetMovement;
}) {
  return (
    <article className="home-flow-stat">
      <h3>{label}</h3>
      {value.status === "unavailable" ? (
        <>
          <strong>Unavailable</strong>
          <p className="muted">{value.reason}</p>
        </>
      ) : (
        <>
          <strong>{formatDecimalCurrency(value.amount, "USD")}</strong>
          <p className={value.status === "partial" ? "warning" : "muted"}>
            {value.reason ??
              "Matched transfers into explicit budget destinations."}
          </p>
        </>
      )}
    </article>
  );
}

function budgetSegmentStyle(value: string): CSSProperties {
  return { flexGrow: Math.max(Number(value), 0) || 0.0001 };
}

export function DashboardExperience({
  dashboard
}: {
  dashboard: HouseholdDashboard;
}) {
  const {
    selectedMonth,
    comparison,
    currentPositions,
    netWorthPeriodChange,
    budget
  } = dashboard;
  const multiCurrency = currentPositions.totals.length > 1;
  const maximumByCurrency = new Map<string, number>();
  for (const row of dashboard.categories) {
    const key = currencyIdentity(row.currency);
    maximumByCurrency.set(
      key,
      Math.max(maximumByCurrency.get(key) ?? 0, Number(row.spending))
    );
  }

  return (
    <div className="home-dashboard" data-testid="home-dashboard">
      <section className="home-month-position" aria-labelledby="month-title">
        <div className="home-month-heading">
          <div>
            <span className="eyebrow">Selected month</span>
            <h2 id="month-title">{selectedMonth.label}</h2>
            <p>
              {selectedMonth.pace.label} · {selectedMonth.periodLabel}
            </p>
          </div>
          <nav className="home-month-navigation" aria-label="Home month">
            <Link
              href={`/dashboard?month=${selectedMonth.previousKey}`}
              aria-label={`Previous month, ${selectedMonth.previousLabel}`}
            >
              <span aria-hidden="true">←</span>
              <span>Previous</span>
            </Link>
            <Link
              href={`/dashboard?month=${selectedMonth.currentKey}`}
              aria-label={`Current month, ${selectedMonth.currentLabel}`}
              aria-current={
                selectedMonth.key === selectedMonth.currentKey
                  ? "page"
                  : undefined
              }
            >
              Current
            </Link>
            <Link
              href={`/dashboard?month=${selectedMonth.nextKey}`}
              aria-label={`Next month, ${selectedMonth.nextLabel}`}
            >
              <span>Next</span>
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </div>
        <div className="home-pace">
          <progress
            max={selectedMonth.pace.daysInMonth}
            value={selectedMonth.pace.elapsedDays}
            aria-label={`${selectedMonth.pace.elapsedDays} of ${selectedMonth.pace.daysInMonth} days elapsed`}
          />
          <div>
            <span>
              {selectedMonth.pace.elapsedDays} elapsed{" "}
              {selectedMonth.pace.elapsedDays === 1 ? "day" : "days"}
            </span>
            <span>{selectedMonth.pace.daysInMonth} days total</span>
          </div>
        </div>
      </section>

      <section
        className="home-comparison-basis"
        aria-labelledby="comparison-title"
      >
        <div>
          <span className="eyebrow">One basis for every delta</span>
          <h2 id="comparison-title">Comparison basis</h2>
        </div>
        <p>{comparison.label}</p>
      </section>

      <div className="home-columns">
        <div className="home-primary-column">
          <section
            className="card home-net-worth"
            aria-labelledby="net-worth-title"
          >
            <div className="home-card-heading">
              <div>
                <span className="eyebrow">Latest signed positions</span>
                <h2 id="net-worth-title">Current net worth</h2>
              </div>
              <Link href="/accounts">Open accounts</Link>
            </div>
            {currentPositions.totals.length ? (
              <ul className="home-value-list">
                {currentPositions.totals.map((total) => (
                  <li key={total.currency}>
                    <strong>
                      {formatDecimalCurrency(total.amount, total.currency)}
                    </strong>
                    {multiCurrency ? <span>{total.currency}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="home-unavailable">
                <strong>Current net worth unavailable</strong>
                <p>Add an account with a known balance and currency.</p>
              </div>
            )}
            {!currentPositions.isComplete ? (
              <p className="warning" role="status">
                Partial current net worth:{" "}
                {currentPositions.missingBalanceAccountIds.length} missing{" "}
                {currentPositions.missingBalanceAccountIds.length === 1
                  ? "balance"
                  : "balances"}{" "}
                and {currentPositions.missingCurrencyAccountIds.length} missing{" "}
                {currentPositions.missingCurrencyAccountIds.length === 1
                  ? "currency"
                  : "currencies"}
                . Missing positions are not treated as zero.
              </p>
            ) : null}
            {multiCurrency ? (
              <p className="muted">
                Currency totals stay separate. Currents applies no implicit
                exchange rate.
              </p>
            ) : null}
            <div className="home-period-change">
              <h3>Recorded change for the selected comparison</h3>
              {netWorthPeriodChange.status === "unavailable" ? (
                <p className="muted">{netWorthPeriodChange.reason}</p>
              ) : (
                <>
                  <strong>
                    {netWorthPeriodChange.change.direction === "decrease"
                      ? "−"
                      : netWorthPeriodChange.change.direction === "increase"
                        ? "+"
                        : ""}
                    {formatDecimalCurrency(
                      netWorthPeriodChange.change.absoluteValue,
                      netWorthPeriodChange.currency
                    )}
                  </strong>
                  <p className="muted">
                    Latest complete recorded points:{" "}
                    {snapshotDate.format(netWorthPeriodChange.comparisonAt)} to{" "}
                    {snapshotDate.format(netWorthPeriodChange.selectedAt)}.
                    Snapshot gaps are not filled.
                  </p>
                </>
              )}
            </div>
          </section>

          <NetWorthHistory history={dashboard.netWorthHistory} />

          <section className="card" aria-labelledby="cash-flow-title">
            <div className="home-card-heading">
              <div>
                <span className="eyebrow">{selectedMonth.periodLabel}</span>
                <h2 id="cash-flow-title">Income and spending</h2>
              </div>
              <span className="muted">Internal transfers excluded</span>
            </div>
            {dashboard.cashFlow.length ? (
              <div className="home-cash-flow-list">
                {dashboard.cashFlow.map((row) => (
                  <article
                    className="home-cash-flow-currency"
                    key={currencyIdentity(row.currency)}
                  >
                    <h3>{currencyIdentity(row.currency)}</h3>
                    <dl>
                      <div>
                        <dt>Income</dt>
                        <dd>
                          <strong>
                            {formatMovementAmount(row.income, row.currency)}
                          </strong>
                          <ChangeText
                            change={row.incomeChange}
                            currency={row.currency}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Spending</dt>
                        <dd>
                          <strong>
                            {formatMovementAmount(row.spending, row.currency)}
                          </strong>
                          <ChangeText
                            change={row.spendingChange}
                            currency={row.currency}
                          />
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className="home-empty">
                <strong>No cash-flow movements recorded</strong>
                <p>
                  Income and spending have no currency total for this selected
                  period.
                </p>
              </div>
            )}
            <p className="muted">
              Pending movements are included and labelled.{" "}
              {dashboard.pendingMovementCount} pending{" "}
              {dashboard.pendingMovementCount === 1 ? "movement" : "movements"}{" "}
              in this period.
            </p>
            <div className="home-plan-movements">
              <BudgetMovementValue
                label="Savings movement"
                value={dashboard.savingsMovement}
              />
              <BudgetMovementValue
                label="Debt paydown"
                value={dashboard.debtPaydown}
              />
            </div>
          </section>

          <section className="card" aria-labelledby="category-spending-title">
            <div className="home-card-heading">
              <div>
                <span className="eyebrow">Transfers excluded</span>
                <h2 id="category-spending-title">Spending by category</h2>
              </div>
              <span className="muted">
                {dashboard.uncategorizedMovementCount} uncategorized
              </span>
            </div>
            {dashboard.categories.length ? (
              <ul className="home-category-list">
                {dashboard.categories.map((row) => {
                  const maximum =
                    maximumByCurrency.get(currencyIdentity(row.currency)) ?? 0;
                  const width =
                    maximum > 0
                      ? Math.max((Number(row.spending) / maximum) * 100, 0)
                      : 0;
                  return (
                    <li
                      key={`${row.categoryId}-${currencyIdentity(row.currency)}`}
                    >
                      <div className="home-category-copy">
                        <strong>
                          {row.categoryName}
                          {row.categoryArchived ? " · archived category" : ""}
                        </strong>
                        <span>
                          {formatMovementAmount(row.spending, row.currency)} ·{" "}
                          <ChangeText
                            change={row.change}
                            currency={row.currency}
                          />
                        </span>
                      </div>
                      <div
                        className="home-category-bar"
                        role="img"
                        aria-label={`${row.categoryName}: ${formatMovementAmount(row.spending, row.currency)} spent`}
                      >
                        <span style={{ width: `${width}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="home-empty">
                <strong>No categorized spending recorded</strong>
                <p>
                  Assign categories to spending movements to build this
                  breakdown.
                </p>
              </div>
            )}
          </section>

          <section className="card home-recent" aria-labelledby="recent-title">
            <div className="home-card-heading">
              <div>
                <span className="eyebrow">One row per movement</span>
                <h2 id="recent-title">Recent movements</h2>
              </div>
              <Link href="/transactions">Open transactions</Link>
            </div>
            {dashboard.recentMovements.length ? (
              <>
                <p className="muted">
                  Latest {dashboard.recentMovements.length} of{" "}
                  {dashboard.movementCount} in the selected period.
                </p>
                <div className="movement-list">
                  {dashboard.recentMovements.map((movement) => (
                    <TransactionRow movement={movement} key={movement.id} />
                  ))}
                </div>
              </>
            ) : (
              <div className="home-empty">
                <strong>No movements recorded</strong>
                <p>No transactions or matched transfers fall in this period.</p>
              </div>
            )}
          </section>
        </div>

        <aside
          className="home-secondary-column"
          aria-label="Monthly plan and accounts"
        >
          <section
            className="card home-budget-card"
            aria-labelledby="budget-snapshot-title"
          >
            <div className="home-card-heading">
              <div>
                <span className="eyebrow">{budget.monthLabel}</span>
                <h2 id="budget-snapshot-title">Budget snapshot</h2>
              </div>
              <Link href={`/budget?month=${budget.monthKey}`}>Open budget</Link>
            </div>
            {budget.plan ? (
              <>
                <dl className="home-budget-headline">
                  <div>
                    <dt>Income plan</dt>
                    <dd>
                      {formatDecimalCurrency(
                        budget.plan.calculation.incomePlan,
                        "USD"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Left to budget</dt>
                    <dd>
                      {formatDecimalCurrency(
                        budget.plan.calculation.leftToBudget,
                        "USD"
                      )}
                    </dd>
                  </div>
                </dl>
                {Number(budget.plan.calculation.totalPlanned) > 0 ? (
                  <div
                    className="home-budget-bar"
                    role="img"
                    aria-label={`Budget allocation: ${budget.plan.calculation.sections
                      .map(
                        (section) =>
                          `${section.section} ${formatDecimalCurrency(section.planned, "USD")}`
                      )
                      .join(", ")}`}
                  >
                    {budget.plan.calculation.sections.map((section) => (
                      <span
                        className={`home-budget-segment is-${section.section.toLowerCase()}`}
                        style={budgetSegmentStyle(section.planned)}
                        key={section.section}
                      >
                        <span className="visually-hidden">
                          {section.section}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No allocation amount is planned.</p>
                )}
                <dl className="home-budget-sections">
                  {budget.plan.calculation.sections.map((section) => (
                    <div key={section.section}>
                      <dt>{section.section}</dt>
                      <dd>
                        {formatDecimalCurrency(section.activity, "USD")}{" "}
                        {section.activityLabel} ·{" "}
                        {formatDecimalCurrency(
                          Number(section.over) > 0
                            ? section.over
                            : section.remaining,
                          "USD"
                        )}{" "}
                        {Number(section.over) > 0
                          ? "over"
                          : section.remainingLabel}
                      </dd>
                    </div>
                  ))}
                </dl>
                {budget.plan.excludedAllocationCount ? (
                  <p className="warning">
                    {budget.plan.excludedAllocationCount} allocation{" "}
                    {budget.plan.excludedAllocationCount === 1 ? "is" : "are"}{" "}
                    unavailable because its category group is invalid.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="home-unavailable">
                <strong>Budget unavailable</strong>
                <p>No plan exists for {budget.monthLabel}.</p>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="obligations-title">
            <div>
              <span className="eyebrow">No due dates inferred</span>
              <h2 id="obligations-title">Remaining this month</h2>
            </div>
            {dashboard.remainingObligations === null ? (
              <div className="home-unavailable">
                <strong>Obligations unavailable</strong>
                <p>A monthly budget plan is required.</p>
              </div>
            ) : dashboard.remainingObligations.length ? (
              <>
                <ul className="home-obligation-list">
                  {dashboard.remainingObligations.map((obligation) => (
                    <li key={obligation.id}>
                      <span>
                        <strong>{obligation.categoryName}</strong>
                        <small>
                          {obligation.section}
                          {obligation.categoryArchived
                            ? " · archived category"
                            : ""}
                        </small>
                      </span>
                      <strong>
                        {formatDecimalCurrency(obligation.amount, "USD")}
                      </strong>
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  These are remaining plan amounts, not scheduled dates or
                  predicted withdrawals.
                </p>
              </>
            ) : (
              <div className="home-empty">
                <strong>No remaining planned obligations</strong>
                <p>Needs, Savings, and Debt rows have no amount remaining.</p>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="account-rollup-title">
            <div className="home-card-heading">
              <div>
                <span className="eyebrow">Signed current positions</span>
                <h2 id="account-rollup-title">Account rollup</h2>
              </div>
              <Link href="/accounts">View all</Link>
            </div>
            <dl className="home-account-rollup">
              {positionGroups.map((group) => {
                const totals =
                  currentPositions.totalsByClassification[group.key];
                return (
                  <div key={group.key}>
                    <dt>
                      {group.label}
                      <small>
                        {dashboard.accountCounts[group.key]}{" "}
                        {dashboard.accountCounts[group.key] === 1
                          ? "account"
                          : "accounts"}
                      </small>
                    </dt>
                    <dd>
                      {totals.length
                        ? totals.map((total) => (
                            <span key={total.currency}>
                              {formatDecimalCurrency(
                                total.amount,
                                total.currency
                              )}
                              {totals.length > 1 ? ` ${total.currency}` : ""}
                            </span>
                          ))
                        : "No known positions"}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {dashboard.accountCounts.UNCLASSIFIED ? (
              <div className="warning home-unclassified">
                <strong>Needs classification</strong>
                <p>
                  {dashboard.accountCounts.UNCLASSIFIED} active connected{" "}
                  {dashboard.accountCounts.UNCLASSIFIED === 1
                    ? "account is"
                    : "accounts are"}{" "}
                  outside the four groups but remain included in current net
                  worth when their position is known.
                </p>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
