import "server-only";
import {
  isCategorySection,
  type CategorySection
} from "@/features/categories/category-domain";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import { prisma } from "@/server/db";
import {
  budgetMonthKey,
  calculateBudget,
  shiftBudgetMonth,
  type BudgetCalculation,
  type BudgetCalculationAllocation
} from "./budget-domain";

export type BudgetDestinationView = {
  id: string;
  name: string;
  mask: string | null;
  currentBalance: string | null;
  isoCurrencyCode: string | null;
  active: boolean;
};

export type HouseholdBudgetView = {
  monthKey: string;
  monthLabel: string;
  previousMonthKey: string;
  nextMonthKey: string;
  previousPlanExists: boolean;
  plan: {
    id: string;
    calculation: BudgetCalculation;
    destinations: Record<string, BudgetDestinationView | null>;
    excludedAllocationCount: number;
  } | null;
};

export async function getHouseholdBudgetView({
  householdId,
  month
}: {
  householdId: string;
  month: Date;
}): Promise<HouseholdBudgetView> {
  const previousMonth = shiftBudgetMonth(month, -1);
  const nextMonth = shiftBudgetMonth(month, 1);
  const [budgetMonth, previousPlan, movements] = await Promise.all([
    prisma.budgetMonth.findUnique({
      where: { householdId_month: { householdId, month } },
      include: {
        allocations: {
          include: {
            category: {
              select: {
                id: true,
                householdId: true,
                name: true,
                section: true,
                sortOrder: true
              }
            },
            destinationAccount: {
              select: {
                id: true,
                householdId: true,
                name: true,
                mask: true,
                currentBalance: true,
                isoCurrencyCode: true,
                isActive: true,
                archivedAt: true
              }
            }
          }
        }
      }
    }),
    prisma.budgetMonth.findUnique({
      where: {
        householdId_month: { householdId, month: previousMonth }
      },
      select: { id: true }
    }),
    getHouseholdMovements({
      householdId,
      from: month,
      to: nextMonth
    })
  ]);

  const allocationRows = budgetMonth?.allocations ?? [];
  type AllocationRow = (typeof allocationRows)[number];
  const validAllocations = allocationRows.filter(
    (
      allocation
    ): allocation is AllocationRow & {
      category: AllocationRow["category"] & { section: CategorySection };
    } =>
      allocation.category.householdId === householdId &&
      isCategorySection(allocation.category.section)
  );
  const calculationAllocations: BudgetCalculationAllocation[] =
    validAllocations.map((allocation) => ({
      id: allocation.id,
      categoryId: allocation.category.id,
      categoryName: allocation.category.name,
      section: allocation.category.section,
      sortOrder: allocation.category.sortOrder,
      planned: allocation.planned.toFixed(2),
      destinationAccountId:
        allocation.destinationAccount?.householdId === householdId
          ? allocation.destinationAccount.id
          : null
    }));
  const destinations = Object.fromEntries(
    validAllocations.map((allocation) => {
      const destination = allocation.destinationAccount;
      return [
        allocation.id,
        destination?.householdId === householdId
          ? {
              id: destination.id,
              name: destination.name,
              mask: destination.mask,
              currentBalance: destination.currentBalance?.toFixed(2) ?? null,
              isoCurrencyCode: destination.isoCurrencyCode,
              active: destination.isActive && destination.archivedAt === null
            }
          : null
      ];
    })
  );

  return {
    monthKey: budgetMonthKey(month),
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(month),
    previousMonthKey: budgetMonthKey(previousMonth),
    nextMonthKey: budgetMonthKey(nextMonth),
    previousPlanExists: previousPlan !== null,
    plan: budgetMonth
      ? {
          id: budgetMonth.id,
          calculation: calculateBudget({
            incomePlan: budgetMonth.income.toFixed(2),
            allocations: calculationAllocations,
            movements
          }),
          destinations,
          excludedAllocationCount:
            budgetMonth.allocations.length - validAllocations.length
        }
      : null
  };
}
