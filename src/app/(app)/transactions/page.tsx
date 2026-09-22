import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdCategoryReviewData } from "@/features/categories/category-data";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import { getHouseholdTransferSuggestions } from "@/features/transactions/transfer-suggestion-data";
import { TransactionsWorkspace } from "@/features/transactions/transactions-workspace";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const owner = await requireHousehold();
  const { query = "" } = await searchParams;
  const [movements, suggestions, categoryReview] = await Promise.all([
    getHouseholdMovements({
      householdId: owner.householdId,
      query,
      limit: 100
    }),
    getHouseholdTransferSuggestions({
      householdId: owner.householdId,
      limit: 100
    }),
    getHouseholdCategoryReviewData(owner.householdId)
  ]);

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
        <TransactionsWorkspace
          movements={movements}
          suggestions={suggestions}
          categories={categoryReview.categories}
          rules={categoryReview.rules}
        />
      </div>
    </>
  );
}
