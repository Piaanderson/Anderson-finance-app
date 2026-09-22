import type { CategorySection } from "@/features/categories/category-domain";
import type { HouseholdMovement } from "@/features/transactions/movements";

export const BUDGET_SECTION_ORDER = [
  "Debt",
  "Savings",
  "Needs",
  "Flex"
] as const satisfies readonly CategorySection[];

export type BudgetCalculationAllocation = {
  id: string;
  categoryId: string;
  categoryName: string;
  section: CategorySection;
  sortOrder: number;
  planned: string;
  destinationAccountId: string | null;
};

export type BudgetCalculationRow = BudgetCalculationAllocation & {
  activity: string;
  remaining: string;
  over: string;
};

export type BudgetSectionCalculation = {
  section: CategorySection;
  planned: string;
  activity: string;
  remaining: string;
  over: string;
  activityLabel: "moved" | "paid" | "spent";
  remainingLabel: "due" | "left";
  rows: BudgetCalculationRow[];
};

export type BudgetCalculation = {
  incomePlan: string;
  observedIncome: string;
  totalPlanned: string;
  leftToBudget: string;
  unassignedSpending: string;
  unallocatedCategorizedSpending: string;
  sections: BudgetSectionCalculation[];
};

function minorUnits(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid fixed-point budget amount: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -magnitude : magnitude;
}

function decimalAmount(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  return `${sign}${magnitude / 100n}.${(magnitude % 100n)
    .toString()
    .padStart(2, "0")}`;
}

function currencyIsUsd({
  kind,
  code
}: {
  kind: "ISO" | "UNOFFICIAL" | "UNKNOWN";
  code: string | null;
}) {
  return kind === "ISO" && code === "USD";
}

function sectionOrder(section: CategorySection) {
  return BUDGET_SECTION_ORDER.indexOf(section);
}

function rowOrder(
  left: BudgetCalculationAllocation,
  right: BudgetCalculationAllocation
) {
  return (
    sectionOrder(left.section) - sectionOrder(right.section) ||
    left.sortOrder - right.sortOrder ||
    left.categoryName.localeCompare(right.categoryName) ||
    left.id.localeCompare(right.id)
  );
}

function labelsFor(section: CategorySection) {
  if (section === "Debt" || section === "Savings") {
    return {
      activityLabel: "moved" as const,
      remainingLabel: "due" as const
    };
  }
  if (section === "Needs") {
    return {
      activityLabel: "paid" as const,
      remainingLabel: "due" as const
    };
  }
  return {
    activityLabel: "spent" as const,
    remainingLabel: "left" as const
  };
}

export function calculateBudget({
  incomePlan,
  allocations,
  movements
}: {
  incomePlan: string;
  allocations: BudgetCalculationAllocation[];
  movements: HouseholdMovement[];
}): BudgetCalculation {
  const income = minorUnits(incomePlan);
  if (income < 0n) throw new Error("Budget income cannot be negative.");

  const sortedAllocations = [...allocations].sort(rowOrder);
  const plannedByAllocation = new Map<string, bigint>();
  for (const allocation of sortedAllocations) {
    const planned = minorUnits(allocation.planned);
    if (planned < 0n) {
      throw new Error(`Budget allocation ${allocation.id} cannot be negative.`);
    }
    plannedByAllocation.set(allocation.id, planned);
  }

  const categoryActivity = new Map<string, bigint>();
  const destinationMovement = new Map<string, bigint>();
  let observedIncome = 0n;
  let unassignedSpending = 0n;

  for (const movement of movements) {
    if (movement.kind === "TRANSFER") {
      const incoming =
        movement.legs.find((leg) => leg.role === "INCOMING") ??
        movement.legs[1];
      if (
        incoming.direction === "INFLOW" &&
        currencyIsUsd(incoming.amount.currency)
      ) {
        destinationMovement.set(
          incoming.account.id,
          (destinationMovement.get(incoming.account.id) ?? 0n) +
            minorUnits(incoming.amount.value)
        );
      }
      continue;
    }

    const [leg] = movement.legs;
    if (!currencyIsUsd(leg.amount.currency)) continue;
    const amount = minorUnits(leg.amount.value);

    if (movement.category) {
      const signedActivity =
        movement.direction === "OUTFLOW"
          ? amount
          : movement.direction === "INFLOW"
            ? -amount
            : 0n;
      categoryActivity.set(
        movement.category.id,
        (categoryActivity.get(movement.category.id) ?? 0n) + signedActivity
      );
    } else if (movement.direction === "INFLOW") {
      observedIncome += amount;
    } else if (movement.direction === "OUTFLOW") {
      unassignedSpending += amount;
    }
  }

  const activityByAllocation = new Map<string, bigint>();
  const allocationsByDestination = new Map<
    string,
    BudgetCalculationAllocation[]
  >();

  for (const allocation of sortedAllocations) {
    if (
      (allocation.section === "Debt" || allocation.section === "Savings") &&
      allocation.destinationAccountId
    ) {
      const group =
        allocationsByDestination.get(allocation.destinationAccountId) ?? [];
      group.push(allocation);
      allocationsByDestination.set(allocation.destinationAccountId, group);
    } else {
      activityByAllocation.set(
        allocation.id,
        categoryActivity.get(allocation.categoryId) ?? 0n
      );
    }
  }

  for (const [accountId, destinationAllocations] of allocationsByDestination) {
    let available = destinationMovement.get(accountId) ?? 0n;
    destinationAllocations.forEach((allocation, index) => {
      const isLast = index === destinationAllocations.length - 1;
      const planned = plannedByAllocation.get(allocation.id) ?? 0n;
      const applied = isLast
        ? available
        : available < planned
          ? available
          : planned;
      activityByAllocation.set(allocation.id, applied);
      available -= applied;
    });
  }

  const allocatedCategoryIds = new Set(
    sortedAllocations.map((allocation) => allocation.categoryId)
  );
  const unallocatedCategorizedSpending = [...categoryActivity.entries()]
    .filter(([categoryId]) => !allocatedCategoryIds.has(categoryId))
    .reduce((total, [, activity]) => total + activity, 0n);

  const sections = BUDGET_SECTION_ORDER.map((section) => {
    const rows = sortedAllocations
      .filter((allocation) => allocation.section === section)
      .map((allocation): BudgetCalculationRow => {
        const planned = plannedByAllocation.get(allocation.id) ?? 0n;
        const activity = activityByAllocation.get(allocation.id) ?? 0n;
        const difference = planned - activity;
        return {
          ...allocation,
          planned: decimalAmount(planned),
          activity: decimalAmount(activity),
          remaining: decimalAmount(difference > 0n ? difference : 0n),
          over: decimalAmount(difference < 0n ? -difference : 0n)
        };
      });
    const planned = rows.reduce(
      (total, row) => total + minorUnits(row.planned),
      0n
    );
    const activity = rows.reduce(
      (total, row) => total + minorUnits(row.activity),
      0n
    );
    const remaining = rows.reduce(
      (total, row) => total + minorUnits(row.remaining),
      0n
    );
    const over = rows.reduce((total, row) => total + minorUnits(row.over), 0n);
    return {
      section,
      planned: decimalAmount(planned),
      activity: decimalAmount(activity),
      remaining: decimalAmount(remaining),
      over: decimalAmount(over),
      ...labelsFor(section),
      rows
    };
  });

  const totalPlanned = sections.reduce(
    (total, section) => total + minorUnits(section.planned),
    0n
  );

  return {
    incomePlan: decimalAmount(income),
    observedIncome: decimalAmount(observedIncome),
    totalPlanned: decimalAmount(totalPlanned),
    leftToBudget: decimalAmount(income - totalPlanned),
    unassignedSpending: decimalAmount(unassignedSpending),
    unallocatedCategorizedSpending: decimalAmount(
      unallocatedCategorizedSpending
    ),
    sections
  };
}

export function parseBudgetMonthKey(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 1900 || year > 2200) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function budgetMonthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export function shiftBudgetMonth(value: Date, offset: number) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1)
  );
}
