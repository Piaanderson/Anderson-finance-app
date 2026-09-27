import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdBudgetView } from "@/features/budget/budget-data";
import { BudgetExperience } from "@/features/budget/budget-experience";
import { parseBudgetMonthKey } from "@/features/budget/budget-domain";
import { currentUtcMonth, getMonthPace } from "@/lib/month";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const owner = await requireHousehold();
  const { month: monthQuery } = await searchParams;
  const now = new Date();
  const selectedMonth =
    (monthQuery ? parseBudgetMonthKey(monthQuery) : null) ??
    currentUtcMonth(now);
  const budget = await getHouseholdBudgetView({
    householdId: owner.householdId,
    month: selectedMonth
  });

  return (
    <>
      <PageHeader title="Budget" />
      <div className="page-content">
        <BudgetExperience
          budget={budget}
          pace={getMonthPace(selectedMonth, now)}
        />
      </div>
    </>
  );
}
