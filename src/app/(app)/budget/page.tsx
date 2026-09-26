import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdBudgetView } from "@/features/budget/budget-data";
import { BudgetExperience } from "@/features/budget/budget-experience";
import { parseBudgetMonthKey } from "@/features/budget/budget-domain";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Budget" };

function defaultBudgetMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function monthPace(month: Date, now: Date) {
  const daysInMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const selectedKey = month.getUTCFullYear() * 12 + month.getUTCMonth();
  const currentKey = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const day =
    selectedKey < currentKey
      ? daysInMonth
      : selectedKey > currentKey
        ? 0
        : Math.min(now.getUTCDate(), daysInMonth);
  return {
    day,
    daysInMonth,
    label:
      day === 0
        ? "Month not started"
        : day === daysInMonth && selectedKey < currentKey
          ? "Month complete"
          : `Day ${day} of ${daysInMonth}`
  };
}

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
    defaultBudgetMonth(now);
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
          pace={monthPace(selectedMonth, now)}
        />
      </div>
    </>
  );
}
