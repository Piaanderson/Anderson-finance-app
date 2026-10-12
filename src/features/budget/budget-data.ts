import "server-only";
import {
  isCategorySection,
  type CategorySection
} from "@/features/categories/category-domain";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import type {
  HouseholdMovement,
  MovementLeg
} from "@/features/transactions/movements";
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

export type BudgetMovementLegView = {
  transactionId: string;
  role: MovementLeg["role"];
  direction: MovementLeg["direction"];
  accountName: string;
  accountMask: string | null;
  effectiveDate: string;
  pending: boolean;
  amount: string;
  currencyKind: MovementLeg["amount"]["currency"]["kind"];
  currencyCode: string | null;
  description: string;
};

export type BudgetMovementView = {
  id: string;
  kind: HouseholdMovement["kind"];
  description: string;
  canonicalDate: string;
  pending: boolean;
  legs: BudgetMovementLegView[];
};

export type BudgetMovementEvidenceView = {
  activityAssociation: "CATEGORY" | "DESTINATION" | "UNAVAILABLE";
  activityNote: string;
  activityMovements: BudgetMovementView[];
  relatedTransferNote: string | null;
  relatedTransfers: BudgetMovementView[];
};

type BudgetPlanView = {
  id: string;
  revision: string;
  calculation: BudgetCalculation;
  destinations: Record<string, BudgetDestinationView | null>;
  destinationOptions: BudgetDestinationView[];
  destinationUseCounts: Record<string, number>;
  allocationRevisions: Record<string, string>;
  excludedAllocationCount: number;
};

export type HouseholdBudgetView = {
  monthKey: string;
  monthLabel: string;
  previousMonthKey: string;
  nextMonthKey: string;
  previousPlanExists: boolean;
  plan: BudgetPlanView | null;
};

export type HouseholdBudgetDetailView = Omit<HouseholdBudgetView, "plan"> & {
  plan:
    | (BudgetPlanView & {
        movementEvidence: Record<string, BudgetMovementEvidenceView>;
      })
    | null;
};

type HouseholdBudgetViewArgs = {
  householdId: string;
  month: Date;
};

type HouseholdBudgetProjection = "SUMMARY" | "BUDGET_DETAIL";

function movementCurrencyIsUsd(movement: HouseholdMovement) {
  return movement.legs.some(
    (leg) =>
      leg.amount.currency.kind === "ISO" && leg.amount.currency.code === "USD"
  );
}

function movementView(movement: HouseholdMovement): BudgetMovementView {
  return {
    id: movement.id,
    kind: movement.kind,
    description: movement.description,
    canonicalDate: movement.canonicalDate,
    pending: movement.pending,
    legs: movement.legs.map((leg) => ({
      transactionId: leg.transactionId,
      role: leg.role,
      direction: leg.direction,
      accountName: leg.account.name,
      accountMask: leg.account.mask,
      effectiveDate: leg.effectiveDate,
      pending: leg.pending,
      amount: leg.amount.value,
      currencyKind: leg.amount.currency.kind,
      currencyCode: leg.amount.currency.code,
      description: leg.merchantName ?? leg.bankDescription ?? leg.name
    }))
  };
}

export function getHouseholdBudgetView(
  args: HouseholdBudgetViewArgs & { projection: "BUDGET_DETAIL" }
): Promise<HouseholdBudgetDetailView>;
export function getHouseholdBudgetView(
  args: HouseholdBudgetViewArgs & { projection?: "SUMMARY" }
): Promise<HouseholdBudgetView>;
export async function getHouseholdBudgetView({
  householdId,
  month,
  projection = "SUMMARY"
}: HouseholdBudgetViewArgs & {
  projection?: HouseholdBudgetProjection;
}): Promise<HouseholdBudgetView | HouseholdBudgetDetailView> {
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
                  sortOrder: true,
                  archivedAt: true
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
      categoryArchived: allocation.category.archivedAt !== null,
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
  const categoryMovements = new Map<string, HouseholdMovement[]>();
  const transfersByDestination = new Map<string, HouseholdMovement[]>();
  for (const movement of movements) {
    if (!movementCurrencyIsUsd(movement)) continue;
    if (movement.kind === "TRANSACTION" && movement.category) {
      const categoryRows = categoryMovements.get(movement.category.id) ?? [];
      categoryRows.push(movement);
      categoryMovements.set(movement.category.id, categoryRows);
      continue;
    }
    if (movement.kind === "TRANSFER") {
      const incoming =
        movement.legs.find((leg) => leg.role === "INCOMING") ??
        movement.legs[1];
      if (
        incoming.direction === "INFLOW" &&
        incoming.amount.currency.kind === "ISO" &&
        incoming.amount.currency.code === "USD"
      ) {
        const destinationRows =
          transfersByDestination.get(incoming.account.id) ?? [];
        destinationRows.push(movement);
        transfersByDestination.set(incoming.account.id, destinationRows);
      }
    }
  }
  const movementEvidence =
    projection === "BUDGET_DETAIL"
      ? Object.fromEntries(
          validAllocations.map((allocation) => {
            const section = allocation.category.section;
            const persistedDestination =
              allocation.destinationAccount?.householdId === householdId
                ? allocation.destinationAccount
                : null;
            const categoryActivity =
              categoryMovements.get(allocation.category.id) ?? [];
            const destinationIsUnique =
              persistedDestination !== null &&
              destinationUseCounts[persistedDestination.id] === 1;
            const destinationTransfers = destinationIsUnique
              ? (transfersByDestination.get(persistedDestination.id) ?? [])
              : [];

            let evidence: BudgetMovementEvidenceView;
            if (section === "Needs") {
              evidence = {
                activityAssociation: "CATEGORY",
                activityNote:
                  categoryActivity.length > 0
                    ? "These categorized USD transactions make up this row’s paid activity."
                    : "No categorized USD transaction contributes paid activity to this row this month.",
                activityMovements: categoryActivity.map(movementView),
                relatedTransferNote:
                  destinationTransfers.length > 0
                    ? "These matched transfers reached this row’s saved destination. They are shown as related evidence and are not counted as Needs category activity."
                    : null,
                relatedTransfers: destinationTransfers.map(movementView)
              };
            } else if (section === "Debt" || section === "Savings") {
              if (!persistedDestination) {
                evidence = {
                  activityAssociation: "UNAVAILABLE",
                  activityNote:
                    "Movement detail unavailable because this row has no saved destination.",
                  activityMovements: [],
                  relatedTransferNote: null,
                  relatedTransfers: []
                };
              } else if (!destinationIsUnique) {
                evidence = {
                  activityAssociation: "UNAVAILABLE",
                  activityNote:
                    "Movement detail unavailable because this saved destination is reused. Matched transfers cannot be assigned honestly to one allocation row.",
                  activityMovements: [],
                  relatedTransferNote: null,
                  relatedTransfers: []
                };
              } else {
                evidence = {
                  activityAssociation: "DESTINATION",
                  activityNote:
                    destinationTransfers.length > 0
                      ? "These matched transfers into the saved destination make up this row’s moved activity."
                      : "No matched USD transfer reached this row’s saved destination this month.",
                  activityMovements: destinationTransfers.map(movementView),
                  relatedTransferNote: null,
                  relatedTransfers: []
                };
              }
            } else {
              evidence = {
                activityAssociation: "UNAVAILABLE",
                activityNote:
                  "Movement evidence is not shown for Flex category progress.",
                activityMovements: [],
                relatedTransferNote: null,
                relatedTransfers: []
              };
            }
            return [allocation.id, evidence];
          })
        )
      : null;

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
          ...(movementEvidence ? { movementEvidence } : {}),
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
