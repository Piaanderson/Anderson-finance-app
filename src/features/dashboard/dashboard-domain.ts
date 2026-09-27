import type { NetWorthHistory } from "@/features/accounts/accounts-experience";
import type { HouseholdBudgetView } from "@/features/budget/budget-data";
import {
  summarizeCategorySpending,
  summarizeMovements,
  type HouseholdMovement,
  type MovementCurrency
} from "@/features/transactions/movements";

type MovementTotals = ReturnType<typeof summarizeMovements>;

export type FixedPointChange =
  | {
      status: "available";
      value: string;
      absoluteValue: string;
      direction: "increase" | "decrease" | "unchanged";
    }
  | { status: "unavailable"; reason: string };

export type DashboardCashFlowRow = {
  currency: MovementCurrency;
  income: string;
  spending: string;
  comparisonIncome: string | null;
  comparisonSpending: string | null;
  incomeChange: FixedPointChange;
  spendingChange: FixedPointChange;
};

export type DashboardCategoryRow = {
  categoryId: string;
  categoryName: string;
  categoryArchived: boolean;
  currency: MovementCurrency;
  spending: string;
  comparisonSpending: string | null;
  change: FixedPointChange;
};

export type DashboardBudgetMovement =
  | {
      status: "available" | "partial";
      amount: string;
      reason: string | null;
    }
  | { status: "unavailable"; amount: null; reason: string };

export type DashboardObligation = {
  id: string;
  categoryName: string;
  categoryArchived: boolean;
  section: "Debt" | "Savings" | "Needs";
  amount: string;
};

export type NetWorthPeriodChange =
  | {
      status: "available";
      currency: string;
      selectedAmount: string;
      comparisonAmount: string;
      selectedAt: Date;
      comparisonAt: Date;
      change: FixedPointChange & { status: "available" };
    }
  | { status: "unavailable"; reason: string };

function minorUnits(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid fixed-point dashboard amount: ${value}`);
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

function absoluteAmount(value: bigint) {
  return decimalAmount(value < 0n ? -value : value);
}

export function fixedPointChange(
  current: string,
  comparison: string | null,
  unavailableReason = "The prior-period value is unavailable."
): FixedPointChange {
  if (comparison === null) {
    return { status: "unavailable", reason: unavailableReason };
  }
  const difference = minorUnits(current) - minorUnits(comparison);
  return {
    status: "available",
    value: decimalAmount(difference),
    absoluteValue: absoluteAmount(difference),
    direction:
      difference > 0n ? "increase" : difference < 0n ? "decrease" : "unchanged"
  };
}

function currencyKey(currency: MovementCurrency) {
  return `${currency.kind}:${currency.code ?? ""}`;
}

export function buildCashFlowRows(
  selected: MovementTotals,
  comparison: MovementTotals | null
): DashboardCashFlowRow[] {
  const selectedByCurrency = new Map(
    selected.map((total) => [currencyKey(total.currency), total])
  );
  const comparisonByCurrency = new Map(
    (comparison ?? []).map((total) => [currencyKey(total.currency), total])
  );
  const keys = new Set([
    ...selectedByCurrency.keys(),
    ...comparisonByCurrency.keys()
  ]);

  return [...keys].sort().map((key) => {
    const selectedTotal = selectedByCurrency.get(key);
    const comparisonTotal = comparisonByCurrency.get(key);
    const currency = selectedTotal?.currency ??
      comparisonTotal?.currency ?? {
        kind: "UNKNOWN" as const,
        code: null
      };
    const income = selectedTotal?.income ?? "0.00";
    const spending = selectedTotal?.spending ?? "0.00";
    const comparisonIncome =
      comparison === null ? null : (comparisonTotal?.income ?? "0.00");
    const comparisonSpending =
      comparison === null ? null : (comparisonTotal?.spending ?? "0.00");
    return {
      currency,
      income,
      spending,
      comparisonIncome,
      comparisonSpending,
      incomeChange: fixedPointChange(income, comparisonIncome),
      spendingChange: fixedPointChange(spending, comparisonSpending)
    };
  });
}

function categoryNames(movements: HouseholdMovement[]) {
  const names = new Map<
    string,
    { name: string; archived: boolean; sortDate: string }
  >();
  for (const movement of movements) {
    if (!movement.category) continue;
    const current = names.get(movement.category.id);
    if (!current || movement.canonicalDate > current.sortDate) {
      names.set(movement.category.id, {
        name: movement.category.name,
        archived: movement.category.archived,
        sortDate: movement.canonicalDate
      });
    }
  }
  return names;
}

export function buildCategoryRows(
  selectedMovements: HouseholdMovement[],
  comparisonMovements: HouseholdMovement[] | null
): DashboardCategoryRow[] {
  const selected = summarizeCategorySpending(selectedMovements);
  const comparison = comparisonMovements
    ? summarizeCategorySpending(comparisonMovements)
    : null;
  const selectedByKey = new Map(
    selected.map((row) => [
      `${row.categoryId}:${currencyKey(row.currency)}`,
      row
    ])
  );
  const comparisonByKey = new Map(
    (comparison ?? []).map((row) => [
      `${row.categoryId}:${currencyKey(row.currency)}`,
      row
    ])
  );
  const names = categoryNames([
    ...selectedMovements,
    ...(comparisonMovements ?? [])
  ]);
  const keys = new Set([...selectedByKey.keys(), ...comparisonByKey.keys()]);

  return [...keys]
    .map((key) => {
      const selectedRow = selectedByKey.get(key);
      const comparisonRow = comparisonByKey.get(key);
      const categoryId =
        selectedRow?.categoryId ?? comparisonRow?.categoryId ?? "";
      const identity = names.get(categoryId);
      const spending = selectedRow?.spending ?? "0.00";
      const comparisonSpending =
        comparison === null ? null : (comparisonRow?.spending ?? "0.00");
      return {
        categoryId,
        categoryName: identity?.name ?? "Unavailable category",
        categoryArchived: identity?.archived ?? false,
        currency: selectedRow?.currency ??
          comparisonRow?.currency ?? { kind: "UNKNOWN", code: null },
        spending,
        comparisonSpending,
        change: fixedPointChange(spending, comparisonSpending)
      };
    })
    .sort((left, right) =>
      minorUnits(right.spending) > minorUnits(left.spending)
        ? 1
        : minorUnits(right.spending) < minorUnits(left.spending)
          ? -1
          : left.categoryName.localeCompare(right.categoryName)
    );
}

export function deriveBudgetMovement(
  budget: HouseholdBudgetView,
  sectionName: "Savings" | "Debt"
): DashboardBudgetMovement {
  if (!budget.plan) {
    return {
      status: "unavailable",
      amount: null,
      reason: `No ${budget.monthLabel} budget exists, so ${sectionName.toLowerCase()} movement cannot be classified from plan destinations.`
    };
  }
  const section = budget.plan.calculation.sections.find(
    (candidate) => candidate.section === sectionName
  );
  if (!section || section.rows.length === 0) {
    return {
      status: "unavailable",
      amount: null,
      reason: `No ${sectionName.toLowerCase()} allocations are planned for ${budget.monthLabel}.`
    };
  }
  const rowsWithDestination = section.rows.filter(
    (row) => row.destinationAccountId
  );
  if (rowsWithDestination.length === 0) {
    return {
      status: "unavailable",
      amount: null,
      reason: `${sectionName} allocations need destination accounts before matched transfers can be classified.`
    };
  }
  const incomplete = rowsWithDestination.length !== section.rows.length;
  return {
    status: incomplete ? "partial" : "available",
    amount: section.activity,
    reason: incomplete
      ? `Partial: ${section.rows.length - rowsWithDestination.length} ${sectionName.toLowerCase()} allocation${section.rows.length - rowsWithDestination.length === 1 ? "" : "s"} lack a destination account.`
      : null
  };
}

export function deriveRemainingObligations(
  budget: HouseholdBudgetView
): DashboardObligation[] | null {
  if (!budget.plan) return null;
  return budget.plan.calculation.sections
    .filter(
      (
        section
      ): section is (typeof budget.plan.calculation.sections)[number] & {
        section: "Debt" | "Savings" | "Needs";
      } =>
        section.section === "Debt" ||
        section.section === "Savings" ||
        section.section === "Needs"
    )
    .flatMap((section) =>
      section.rows
        .filter((row) => minorUnits(row.remaining) > 0n)
        .map((row) => ({
          id: row.id,
          categoryName: row.categoryName,
          categoryArchived: row.categoryArchived,
          section: section.section,
          amount: row.remaining
        }))
    );
}

function pointsInPeriod(
  history: Extract<NetWorthHistory, { status: "available" }>,
  start: Date,
  end: Date
) {
  return history.points.filter(
    (point) => point.effectiveAt >= start && point.effectiveAt < end
  );
}

export function deriveNetWorthPeriodChange({
  history,
  selectedStart,
  selectedEnd,
  comparisonStart,
  comparisonEnd
}: {
  history: NetWorthHistory;
  selectedStart: Date;
  selectedEnd: Date;
  comparisonStart: Date;
  comparisonEnd: Date;
}): NetWorthPeriodChange {
  if (history.status === "unavailable") {
    return { status: "unavailable", reason: history.reason };
  }
  const selected = pointsInPeriod(history, selectedStart, selectedEnd).at(-1);
  const comparison = pointsInPeriod(history, comparisonStart, comparisonEnd).at(
    -1
  );
  if (!selected || !comparison) {
    return {
      status: "unavailable",
      reason:
        "Both periods need a complete recorded net-worth snapshot. Missing periods are not synthesized."
    };
  }
  if (selected.currency !== comparison.currency) {
    return {
      status: "unavailable",
      reason:
        "The recorded comparison points use different currencies. Currents does not apply an implicit exchange rate."
    };
  }
  const change = fixedPointChange(selected.amount, comparison.amount);
  if (change.status === "unavailable") {
    return { status: "unavailable", reason: change.reason };
  }
  return {
    status: "available",
    currency: selected.currency,
    selectedAmount: selected.amount,
    comparisonAmount: comparison.amount,
    selectedAt: selected.effectiveAt,
    comparisonAt: comparison.effectiveAt,
    change
  };
}
