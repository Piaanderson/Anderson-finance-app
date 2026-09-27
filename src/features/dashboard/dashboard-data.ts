import "server-only";
import {
  getAccountOverview,
  getHouseholdNetWorthHistory
} from "@/features/accounts/data";
import { getHouseholdBudgetView } from "@/features/budget/budget-data";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import { summarizeMovements } from "@/features/transactions/movements";
import {
  currentUtcMonth,
  getMonthPace,
  getPreviousMonthComparison,
  monthKey,
  monthLabel,
  monthPeriodLabel,
  shiftMonth
} from "@/lib/month";
import {
  buildCashFlowRows,
  buildCategoryRows,
  deriveBudgetMovement,
  deriveNetWorthPeriodChange,
  deriveRemainingObligations
} from "./dashboard-domain";

export async function getHouseholdDashboard({
  householdId,
  month,
  now = new Date()
}: {
  householdId: string;
  month: Date;
  now?: Date;
}) {
  const pace = getMonthPace(month, now);
  const comparison = getPreviousMonthComparison(month, pace);
  const comparisonMovementsPromise = comparison.available
    ? getHouseholdMovements({
        householdId,
        from: comparison.periodStart,
        to: comparison.periodEnd
      })
    : Promise.resolve([]);

  const [
    accounts,
    selectedMovements,
    comparisonMovements,
    budget,
    comparisonHistory
  ] = await Promise.all([
    getAccountOverview(householdId, now),
    getHouseholdMovements({
      householdId,
      from: pace.periodStart,
      to: pace.periodEnd
    }),
    comparisonMovementsPromise,
    getHouseholdBudgetView({ householdId, month }),
    getHouseholdNetWorthHistory({
      householdId,
      windowStart: comparison.periodStart,
      windowEnd: pace.periodEnd
    })
  ]);

  const comparisonValue = comparison.available ? comparisonMovements : null;
  const pendingMovementCount = selectedMovements.filter(
    (movement) => movement.pending
  ).length;
  const uncategorizedMovementCount = selectedMovements.filter(
    (movement) =>
      movement.kind === "TRANSACTION" &&
      movement.direction !== "NEUTRAL" &&
      !movement.category
  ).length;

  return {
    selectedMonth: {
      key: monthKey(month),
      label: monthLabel(month),
      previousKey: monthKey(shiftMonth(month, -1)),
      previousLabel: monthLabel(shiftMonth(month, -1)),
      nextKey: monthKey(shiftMonth(month, 1)),
      nextLabel: monthLabel(shiftMonth(month, 1)),
      currentKey: monthKey(currentUtcMonth(now)),
      currentLabel: monthLabel(currentUtcMonth(now)),
      pace,
      periodLabel: monthPeriodLabel(pace)
    },
    comparison,
    cashFlow: buildCashFlowRows(
      summarizeMovements(selectedMovements),
      comparisonValue ? summarizeMovements(comparisonValue) : null
    ),
    categories: buildCategoryRows(selectedMovements, comparisonValue),
    pendingMovementCount,
    uncategorizedMovementCount,
    recentMovements: selectedMovements.slice(0, 5),
    movementCount: selectedMovements.length,
    currentPositions: accounts.positionSummary,
    accountCounts: {
      CASH: accounts.accounts.filter(
        (account) => account.classification === "CASH"
      ).length,
      INVESTED: accounts.accounts.filter(
        (account) => account.classification === "INVESTED"
      ).length,
      PROPERTY: accounts.accounts.filter(
        (account) => account.classification === "PROPERTY"
      ).length,
      DEBT: accounts.accounts.filter(
        (account) => account.classification === "DEBT"
      ).length,
      UNCLASSIFIED: accounts.accounts.filter(
        (account) => account.classification === "UNCLASSIFIED"
      ).length
    },
    netWorthHistory: accounts.netWorthHistory,
    netWorthPeriodChange: comparison.available
      ? deriveNetWorthPeriodChange({
          history: comparisonHistory,
          selectedStart: pace.periodStart,
          selectedEnd: pace.periodEnd,
          comparisonStart: comparison.periodStart,
          comparisonEnd: comparison.periodEnd
        })
      : {
          status: "unavailable" as const,
          reason: comparison.label
        },
    budget,
    savingsMovement: deriveBudgetMovement(budget, "Savings"),
    debtPaydown: deriveBudgetMovement(budget, "Debt"),
    remainingObligations: deriveRemainingObligations(budget)
  };
}

export type HouseholdDashboard = Awaited<
  ReturnType<typeof getHouseholdDashboard>
>;
