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
  classification: "CASH" | "INVESTED" | "PROPERTY" | "DEBT" | "UNCLASSIFIED";
  active: boolean;
  relatedProperties: Array<{
    id: string;
    name: string;
    currentBalance: string | null;
  }>;
};

export type HouseholdBudgetView = {
  monthKey: string;
  monthLabel: string;
  previousMonthKey: string;
  nextMonthKey: string;
  previousPlanExists: boolean;
  plan: {
    id: string;
    revision: string;
    calculation: BudgetCalculation;
    destinations: Record<string, BudgetDestinationView | null>;
    destinationOptions: BudgetDestinationView[];
    destinationUseCounts: Record<string, number>;
    allocationRevisions: Record<string, string>;
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
  const [budgetMonth, previousPlan, movements, destinationAccounts] =
    await Promise.all([
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
                  classification: true,
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
      }),
      prisma.financialAccount.findMany({
        where: {
          householdId,
          isActive: true,
          archivedAt: null,
          isoCurrencyCode: "USD"
        },
        select: {
          id: true,
          name: true,
          mask: true,
          currentBalance: true,
          isoCurrencyCode: true,
          classification: true,
          debtLinks: {
            where: {
              householdId,
              propertyAccount: {
                householdId,
                isActive: true,
                archivedAt: null
              }
            },
            select: {
              propertyAccount: {
                select: {
                  id: true,
                  name: true,
                  currentBalance: true
                }
              }
            }
          }
        },
        orderBy: [{ classification: "asc" }, { name: "asc" }]
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
  const destinationOptions: BudgetDestinationView[] = destinationAccounts.map(
    (account) => ({
      id: account.id,
      name: account.name,
      mask: account.mask,
      currentBalance: account.currentBalance?.toFixed(2) ?? null,
      isoCurrencyCode: account.isoCurrencyCode,
      classification: account.classification,
      active: true,
      relatedProperties: account.debtLinks.map(({ propertyAccount }) => ({
        id: propertyAccount.id,
        name: propertyAccount.name,
        currentBalance: propertyAccount.currentBalance?.toFixed(2) ?? null
      }))
    })
  );
  const destinationOptionsById = new Map(
    destinationOptions.map((destination) => [destination.id, destination])
  );
  const destinations = Object.fromEntries(
    validAllocations.map((allocation) => {
      const destination = allocation.destinationAccount;
      const activeDestination = destination
        ? destinationOptionsById.get(destination.id)
        : null;
      return [
        allocation.id,
        destination?.householdId === householdId
          ? (activeDestination ?? {
              id: destination.id,
              name: destination.name,
              mask: destination.mask,
              currentBalance: destination.currentBalance?.toFixed(2) ?? null,
              isoCurrencyCode: destination.isoCurrencyCode,
              classification: destination.classification,
              active: false,
              relatedProperties: []
            })
          : null
      ];
    })
  );
  const destinationUseCounts = validAllocations.reduce<Record<string, number>>(
    (counts, allocation) => {
      if (allocation.destinationAccountId) {
        counts[allocation.destinationAccountId] =
          (counts[allocation.destinationAccountId] ?? 0) + 1;
      }
      return counts;
    },
    {}
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
          revision: budgetMonth.updatedAt.toISOString(),
          calculation: calculateBudget({
            incomePlan: budgetMonth.income.toFixed(2),
            allocations: calculationAllocations,
            movements
          }),
          destinations,
          destinationOptions,
          destinationUseCounts,
          allocationRevisions: Object.fromEntries(
            validAllocations.map((allocation) => [
              allocation.id,
              allocation.updatedAt.toISOString()
            ])
          ),
          excludedAllocationCount:
            budgetMonth.allocations.length - validAllocations.length
        }
      : null
  };
}
