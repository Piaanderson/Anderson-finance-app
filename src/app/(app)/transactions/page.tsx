import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { ReviewCard } from "@/features/transactions/review-card";
import { TransactionRow } from "@/features/transactions/transaction-row";
import { prisma } from "@/server/db";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const owner = await requireHousehold();
  const { query = "" } = await searchParams;
  const transactions = await prisma.transaction.findMany({
    where: {
      householdId: owner.householdId,
      removedAt: null,
      incomingTransfer: { is: null },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              {
                merchantName: {
                  contains: query,
                  mode: "insensitive" as const
                }
              }
            ]
          }
        : {})
    },
    include: {
      account: true,
      category: true,
      outgoingTransfer: {
        include: {
          incomingTransaction: { include: { account: true } }
        }
      }
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100
  });
  const uncategorized = transactions.filter(
    (transaction) => !transaction.categoryId
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
        <section className="card" aria-labelledby="ledger-title">
          <div className="section-heading">
            <h2 id="ledger-title">September ledger</h2>
            <span className="muted">{transactions.length} movements</span>
          </div>
          {transactions.length ? (
            <div>
              {transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  name={transaction.merchantName ?? transaction.name}
                  account={transaction.account.name}
                  category={
                    transaction.category?.name ??
                    transaction.categoryPrimary ??
                    "Uncategorized"
                  }
                  date={transaction.date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC"
                  })}
                  amount={transaction.amount.toNumber() * -1}
                  pending={transaction.pending}
                  transferLegs={
                    transaction.outgoingTransfer
                      ? [
                          {
                            account: transaction.account.name,
                            amount: transaction.amount.toNumber() * -1,
                            date: transaction.date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC"
                            })
                          },
                          {
                            account:
                              transaction.outgoingTransfer.incomingTransaction
                                .account.name,
                            amount:
                              transaction.outgoingTransfer.incomingTransaction.amount.toNumber() *
                              -1,
                            date: transaction.outgoingTransfer.incomingTransaction.date.toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC"
                              }
                            )
                          }
                        ]
                      : undefined
                  }
                />
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
