import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdPositionSummary } from "@/features/accounts/position-summary";
import { getHouseholdCashFlow } from "@/features/transactions/movement-data";
import { requireHousehold } from "@/server/households";
import { formatCurrency, formatMovementAmount } from "@/lib/money";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const owner = await requireHousehold();
  const [positionSummary, cashFlow] = await Promise.all([
    getHouseholdPositionSummary(owner.householdId),
    getHouseholdCashFlow({
      householdId: owner.householdId,
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-10-01T00:00:00.000Z")
    })
  ]);

  return (
    <>
      <PageHeader title="Home" kicker="September 2026 · day 12 of 30" />
      <div className="page-content">
        <div className="stat-grid">
          <article className="card">
            <span className="eyebrow">
              {positionSummary.totals.length > 1
                ? "Net worth by currency"
                : "Net worth"}
            </span>
            {positionSummary.totals.length === 0 ? (
              <strong className="card-value">Unavailable</strong>
            ) : (
              positionSummary.totals.map((total) => (
                <strong className="card-value" key={total.currency}>
                  {formatCurrency(total.amount, total.currency)}
                </strong>
              ))
            )}
            <span className="muted">
              {positionSummary.accountCount} active accounts
              {positionSummary.isComplete
                ? ""
                : " · partial because a balance or currency is missing"}
            </span>
          </article>
          <article className="card">
            <span className="eyebrow">Income this month</span>
            {cashFlow.length ? (
              cashFlow.map((total) => (
                <strong
                  className="card-value positive"
                  key={`${total.currency.kind}:${total.currency.code}`}
                >
                  {formatMovementAmount(total.income, total.currency)}
                </strong>
              ))
            ) : (
              <strong className="card-value">Unavailable</strong>
            )}
            <span className="muted">
              Money in through today · transfers excluded
            </span>
          </article>
          <article className="card">
            <span className="eyebrow">Spending this month</span>
            {cashFlow.length ? (
              cashFlow.map((total) => (
                <strong
                  className="card-value"
                  key={`${total.currency.kind}:${total.currency.code}`}
                >
                  {formatMovementAmount(total.spending, total.currency)}
                </strong>
              ))
            ) : (
              <strong className="card-value">Unavailable</strong>
            )}
            <span className="muted">Pending included · transfers excluded</span>
          </article>
        </div>
        <section className="card">
          <span className="eyebrow">What changed</span>
          <h2>September is taking shape</h2>
          <p className="muted">
            Currents will compare cash flow, debt paydown, and savings movement
            as connected transaction data arrives.
          </p>
        </section>
      </div>
    </>
  );
}
