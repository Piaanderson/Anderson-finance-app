import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { ReviewCard } from "@/features/transactions/review-card";
import { TransactionRow } from "@/features/transactions/transaction-row";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const owner = await requireHousehold();
  const { query = "" } = await searchParams;
  const movements = await getHouseholdMovements({
    householdId: owner.householdId,
    query,
    limit: 100
  });
  const uncategorized = movements.filter(
    (movement) => movement.kind === "TRANSACTION" && movement.category === null
  ).length;

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <form method="get" role="search" className="page-actions">
            <label className="field">
              <span>Search transactions</span>
              <input
                className="input"
                type="search"
                name="query"
                defaultValue={query}
                placeholder="Merchant or memo"
              />
            </label>
            <button className="button secondary" type="submit">
              Search
            </button>
          </form>
        }
      />
      <div className="page-content">
        <div className="stat-grid">
          <ReviewCard
            title="Transfers to verify"
            description="Pair both bank legs so one movement is counted once."
            count={0}
          />
          <ReviewCard
            title="Categories to assign"
            description="Confirm a category and optionally create a merchant rule."
            count={uncategorized}
          />
        </div>
        <section
          className="card movement-ledger"
          aria-labelledby="ledger-title"
        >
          <div className="section-heading">
            <h2 id="ledger-title">Movement ledger</h2>
            <span className="muted">{movements.length} movements</span>
          </div>
          {movements.length ? (
            <div className="movement-list">
              {movements.map((movement) => (
                <TransactionRow key={movement.id} movement={movement} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>No transactions yet</h2>
              <p className="muted">
                Connect an account and start the sync worker to fill this
                ledger.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
