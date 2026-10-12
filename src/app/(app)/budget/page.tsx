import type { Metadata } from "next";
import { getHouseholdBudgetView } from "@/features/budget/budget-data";
import { BudgetExperience } from "@/features/budget/budget-experience";
import {
  budgetMonthKey,
  parseBudgetMonthKey
} from "@/features/budget/budget-domain";
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
    month: selectedMonth,
    projection: "BUDGET_DETAIL"
  });

  return (
    <div className="page-content budget-page-content">
      <BudgetExperience
        budget={budget}
        pace={getMonthPace(selectedMonth, now)}
        todayMonthKey={budgetMonthKey(currentUtcMonth(now))}
      />
    </div>
  );
}
