import type { Metadata } from "next";
import { getHouseholdCategoryReviewData } from "@/features/categories/category-data";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import { getHouseholdTransferSuggestions } from "@/features/transactions/transfer-suggestion-data";
import { TransactionsWorkspace } from "@/features/transactions/transactions-workspace";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Transactions" };

function monthKey(value: string) {
  return value.slice(0, 7);
}

function validMonth(value: string | undefined) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{ query?: string; month?: string }>;
}) {
  const owner = await requireHousehold();
  const { query = "", month: requestedMonth } = await searchParams;
  const [allMovements, suggestions, categoryReview] = await Promise.all([
    getHouseholdMovements({
      householdId: owner.householdId,
      query
    }),
    getHouseholdTransferSuggestions({
      householdId: owner.householdId,
      limit: 100
    }),
    getHouseholdCategoryReviewData(owner.householdId)
  ]);
  const month =
    validMonth(requestedMonth) ??
    allMovements[0]?.canonicalDate.slice(0, 7) ??
    new Date().toISOString().slice(0, 7);
  const movements = allMovements.filter(
    (movement) => monthKey(movement.canonicalDate) === month
  );
  const visibleTransactionIds = new Set(
    movements.flatMap((movement) =>
      movement.legs.map((leg) => leg.transactionId)
    )
  );
  const scopedSuggestions = suggestions
    .filter((suggestion) =>
      visibleTransactionIds.has(suggestion.outgoingTransactionId)
    )
    .map((suggestion) => ({
      ...suggestion,
      candidates: suggestion.candidates.filter(
        (candidate) =>
          visibleTransactionIds.has(candidate.outgoing.transactionId) &&
          visibleTransactionIds.has(candidate.incoming.transactionId)
      )
    }))
    .filter((suggestion) => suggestion.candidates.length > 0);

  return (
    <div className="page-content transactions-page-content">
      <TransactionsWorkspace
        key={`${month}:${query}`}
        movements={movements}
        suggestions={scopedSuggestions}
        categories={categoryReview.categories}
        rules={categoryReview.rules}
        month={month}
        query={query}
      />
    </div>
  );
}
