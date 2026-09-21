import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdPositionSummary } from "@/features/accounts/position-summary";
import { prisma } from "@/server/db";
import { requireHousehold } from "@/server/households";
import { formatCurrency, usd } from "@/lib/money";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const owner = await requireHousehold();
  const [positionSummary, monthTransactions] = await Promise.all([
    getHouseholdPositionSummary(owner.householdId),
    prisma.transaction.findMany({
      where: {
        householdId: owner.householdId,
        removedAt: null,
        date: { gte: new Date("2026-09-01T00:00:00.000Z") }
      }
    })
  ]);

  const spending = monthTransactions
    .filter((transaction) => transaction.amount.toNumber() > 0)
    .reduce((sum, transaction) => sum + transaction.amount.toNumber(), 0);
  const income = monthTransactions
    .filter((transaction) => transaction.amount.toNumber() < 0)
    .reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount.toNumber()),
      0
    );

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
            <strong className="card-value positive">
              {usd.format(income)}
            </strong>
            <span className="muted">Deposits synced through today</span>
          </article>
          <article className="card">
            <span className="eyebrow">Spending this month</span>
            <strong className="card-value">{usd.format(spending)}</strong>
            <span className="muted">Pending transactions included</span>
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
