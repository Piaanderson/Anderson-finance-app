import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { prisma } from "@/server/db";
import { requireHousehold } from "@/server/households";
import { signedUsd, usd } from "@/lib/money";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const owner = await requireHousehold();
  const [accounts, monthTransactions] = await Promise.all([
    prisma.financialAccount.findMany({
      where: { householdId: owner.householdId, isActive: true }
    }),
    prisma.transaction.findMany({
      where: {
        householdId: owner.householdId,
        removedAt: null,
        date: { gte: new Date("2026-09-01T00:00:00.000Z") }
      }
    })
  ]);

  const netWorth = accounts.reduce((sum, account) => {
    const balance = account.currentBalance?.toNumber() ?? 0;
    return (
      sum + (["credit", "loan"].includes(account.type) ? -balance : balance)
    );
  }, 0);
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
            <span className="eyebrow">Net worth</span>
            <strong className="card-value">{signedUsd(netWorth)}</strong>
            <span className="muted">{accounts.length} connected accounts</span>
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
