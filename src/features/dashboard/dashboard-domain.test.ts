import { describe, expect, it } from "vitest";
import type { NetWorthHistory } from "@/features/accounts/accounts-experience";
import { BUDGET_SECTION_ORDER } from "@/features/budget/budget-domain";
import type { HouseholdBudgetView } from "@/features/budget/budget-data";
import {
  buildHouseholdMovements,
  summarizeMovements,
  type MovementSourceTransaction
} from "@/features/transactions/movements";
import {
  getMonthPace,
  getPreviousMonthComparison,
  monthPeriodLabel,
  parseMonthKey
} from "@/lib/month";
import {
  buildCashFlowRows,
  buildCategoryRows,
  deriveBudgetMovement,
  deriveNetWorthPeriodChange,
  deriveRemainingObligations,
  fixedPointChange
} from "./dashboard-domain";

const now = new Date("2026-09-12T18:30:00.000Z");

function sourceTransaction(
  overrides: Partial<MovementSourceTransaction> & {
    id: string;
    amount: string;
    date: Date;
  }
): MovementSourceTransaction {
  return {
    id: overrides.id,
    householdId: "home",
    accountId: overrides.accountId ?? "checking",
    account: overrides.account ?? {
      id: overrides.accountId ?? "checking",
      householdId: "home",
      name: "Checking",
      mask: null,
      isActive: true
    },
    name: overrides.name ?? "Movement",
    merchantName: overrides.merchantName ?? null,
    bankDescription: null,
    paymentMemo: null,
    referenceNumber: null,
    paymentChannel: null,
    transactionCode: null,
    checkNumber: null,
    amount: overrides.amount,
    isoCurrencyCode: overrides.isoCurrencyCode ?? "USD",
    unofficialCurrencyCode: overrides.unofficialCurrencyCode ?? null,
    date: overrides.date,
    authorizedDate: overrides.authorizedDate ?? null,
    pending: overrides.pending ?? false,
    removedAt: null,
    updatedAt: overrides.updatedAt ?? overrides.date,
    category: overrides.category ?? null
  };
}

function budgetView(
  rows: Array<{
    id: string;
    section: "Debt" | "Savings" | "Needs" | "Flex";
    remaining: string;
    activity: string;
    destinationAccountId: string | null;
  }> | null
): HouseholdBudgetView {
  return {
    monthKey: "2026-09",
    monthLabel: "September 2026",
    previousMonthKey: "2026-08",
    nextMonthKey: "2026-10",
    previousPlanExists: false,
    plan:
      rows === null
        ? null
        : {
            id: "budget",
            revision: now.toISOString(),
            destinations: {},
            destinationOptions: [],
            destinationUseCounts: {},
            allocationRevisions: {},
            excludedAllocationCount: 0,
            calculation: {
              incomePlan: "1000.00",
              observedIncome: "900.00",
              totalPlanned: "700.00",
              leftToBudget: "300.00",
              unassignedSpending: "0.00",
              unallocatedCategorizedSpending: "0.00",
              sections: BUDGET_SECTION_ORDER.map((section) => {
                const sectionRows = rows
                  .filter((row) => row.section === section)
                  .map((row) => ({
                    id: row.id,
                    categoryId: `${row.id}-category`,
                    categoryName: row.id,
                    section,
                    sortOrder: 0,
                    categoryArchived: false,
                    planned: "200.00",
                    destinationAccountId: row.destinationAccountId,
                    activity: row.activity,
                    remaining: row.remaining,
                    over: "0.00"
                  }));
                return {
                  section,
                  planned: sectionRows.length ? "200.00" : "0.00",
                  activity: sectionRows.reduce(
                    (sum, row) =>
                      (Number(sum) + Number(row.activity)).toFixed(2),
                    "0.00"
                  ),
                  remaining: sectionRows.reduce(
                    (sum, row) =>
                      (Number(sum) + Number(row.remaining)).toFixed(2),
                    "0.00"
                  ),
                  over: "0.00",
                  activityLabel:
                    section === "Debt" || section === "Savings"
                      ? ("moved" as const)
                      : section === "Needs"
                        ? ("paid" as const)
                        : ("spent" as const),
                  remainingLabel:
                    section === "Flex" ? ("left" as const) : ("due" as const),
                  rows: sectionRows
                };
              })
            }
          }
  };
}

describe("shared UTC month model", () => {
  it("parses canonical month keys and rejects invalid values", () => {
    expect(parseMonthKey("2026-09")?.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    );
    expect(parseMonthKey("2026-9")).toBeNull();
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("1899-12")).toBeNull();
  });

  it("calculates current, past, and future month boundaries and pace in UTC", () => {
    const current = getMonthPace(new Date("2026-09-01T00:00:00.000Z"), now);
    expect(current).toMatchObject({
      state: "in-progress",
      day: 12,
      daysInMonth: 30,
      elapsedDays: 12,
      label: "Day 12 of 30"
    });
    expect(current.periodEnd.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    expect(monthPeriodLabel(current)).toBe(
      "September 1, 2026–September 12, 2026"
    );

    const past = getMonthPace(new Date("2024-02-01T00:00:00.000Z"), now);
    expect(past).toMatchObject({
      state: "complete",
      day: 29,
      daysInMonth: 29,
      elapsedDays: 29
    });
    expect(past.periodEnd.toISOString()).toBe("2024-03-01T00:00:00.000Z");

    const future = getMonthPace(new Date("2026-10-01T00:00:00.000Z"), now);
    expect(future).toMatchObject({
      state: "not-started",
      day: 0,
      elapsedDays: 0,
      label: "Month not started · 31 days"
    });
    expect(future.periodStart).toEqual(future.periodEnd);
  });

  it("labels the exact prior-month same-span comparison", () => {
    const pace = getMonthPace(new Date("2026-09-01T00:00:00.000Z"), now);
    expect(
      getPreviousMonthComparison(new Date("2026-09-01T00:00:00.000Z"), pace)
    ).toMatchObject({
      available: true,
      elapsedDays: 12,
      label: "Previous month, same elapsed span: August 1, 2026–August 12, 2026"
    });
  });
});

describe("Home fixed-point summaries", () => {
  it("calculates exact changes without floating-point arithmetic", () => {
    expect(
      fixedPointChange("9007199254740993.01", "9007199254740992.99")
    ).toEqual({
      status: "available",
      value: "0.02",
      absoluteValue: "0.02",
      direction: "increase"
    });
    expect(fixedPointChange("1.00", null)).toMatchObject({
      status: "unavailable"
    });
  });

  it("keeps currencies separate and represents a missing selected total as zero", () => {
    const rows = buildCashFlowRows(
      [
        {
          currency: { kind: "ISO", code: "USD" },
          income: "100.00",
          spending: "40.00"
        },
        {
          currency: { kind: "ISO", code: "CAD" },
          income: "20.00",
          spending: "5.00"
        }
      ],
      [
        {
          currency: { kind: "ISO", code: "USD" },
          income: "80.00",
          spending: "50.00"
        },
        {
          currency: { kind: "UNOFFICIAL", code: "POINTS" },
          income: "3.00",
          spending: "0.00"
        }
      ]
    );
    expect(
      rows.map((row) => `${row.currency.kind}:${row.currency.code}`)
    ).toEqual(["ISO:CAD", "ISO:USD", "UNOFFICIAL:POINTS"]);
    expect(rows[1]).toMatchObject({
      income: "100.00",
      comparisonIncome: "80.00",
      incomeChange: { value: "20.00", direction: "increase" }
    });
    expect(rows[2]).toMatchObject({
      income: "0.00",
      comparisonIncome: "3.00",
      incomeChange: { value: "-3.00", direction: "decrease" }
    });
  });

  it("excludes matched transfers from Home income, spending, and category totals", () => {
    const transactions = [
      sourceTransaction({
        id: "income",
        amount: "-100.00",
        date: new Date("2026-09-02T00:00:00.000Z")
      }),
      sourceTransaction({
        id: "spending",
        amount: "25.00",
        date: new Date("2026-09-03T00:00:00.000Z"),
        pending: true,
        category: {
          id: "groceries",
          householdId: "home",
          name: "Groceries",
          section: "Needs",
          archivedAt: new Date("2026-09-10T00:00:00.000Z")
        }
      }),
      sourceTransaction({
        id: "transfer-out",
        accountId: "checking",
        amount: "500.00",
        date: new Date("2026-09-04T00:00:00.000Z")
      }),
      sourceTransaction({
        id: "transfer-in",
        accountId: "savings",
        account: {
          id: "savings",
          householdId: "home",
          name: "Savings",
          mask: null,
          isActive: true
        },
        amount: "-500.00",
        date: new Date("2026-09-04T00:00:00.000Z")
      })
    ];
    const movements = buildHouseholdMovements({
      householdId: "home",
      transactions,
      matches: [
        {
          id: "match",
          householdId: "home",
          outgoingTransactionId: "transfer-out",
          incomingTransactionId: "transfer-in"
        }
      ]
    });

    expect(summarizeMovements(movements)).toEqual([
      {
        currency: { kind: "ISO", code: "USD" },
        income: "100.00",
        spending: "25.00"
      }
    ]);
    expect(buildCategoryRows(movements, [])).toMatchObject([
      {
        categoryName: "Groceries",
        categoryArchived: true,
        spending: "25.00"
      }
    ]);
  });
});

describe("Home unavailable and plan-linked states", () => {
  it("does not synthesize a net-worth comparison across snapshot gaps", () => {
    const history: NetWorthHistory = {
      status: "available",
      currency: "USD",
      points: [
        {
          effectiveAt: new Date("2026-09-10T12:00:00.000Z"),
          amount: "100.00",
          currency: "USD"
        },
        {
          effectiveAt: new Date("2026-09-11T12:00:00.000Z"),
          amount: "110.00",
          currency: "USD"
        }
      ]
    };
    expect(
      deriveNetWorthPeriodChange({
        history,
        selectedStart: new Date("2026-09-01T00:00:00.000Z"),
        selectedEnd: new Date("2026-10-01T00:00:00.000Z"),
        comparisonStart: new Date("2026-08-01T00:00:00.000Z"),
        comparisonEnd: new Date("2026-09-01T00:00:00.000Z")
      })
    ).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("Missing periods are not synthesized")
    });
  });

  it("derives savings and debt only from budget rows with explicit destinations", () => {
    const complete = budgetView([
      {
        id: "card",
        section: "Debt",
        remaining: "50.00",
        activity: "150.00",
        destinationAccountId: "card-account"
      },
      {
        id: "vacation",
        section: "Savings",
        remaining: "100.00",
        activity: "100.00",
        destinationAccountId: "savings-account"
      },
      {
        id: "mortgage",
        section: "Needs",
        remaining: "25.00",
        activity: "175.00",
        destinationAccountId: "mortgage-account"
      }
    ]);
    expect(deriveBudgetMovement(complete, "Debt")).toEqual({
      status: "available",
      amount: "150.00",
      reason: null
    });
    expect(deriveBudgetMovement(complete, "Savings")).toEqual({
      status: "available",
      amount: "100.00",
      reason: null
    });
    expect(deriveRemainingObligations(complete)).toMatchObject([
      { categoryName: "card", amount: "50.00" },
      { categoryName: "vacation", amount: "100.00" },
      { categoryName: "mortgage", amount: "25.00" }
    ]);

    expect(
      deriveBudgetMovement(
        budgetView([
          {
            id: "unlinked",
            section: "Debt",
            remaining: "200.00",
            activity: "0.00",
            destinationAccountId: null
          }
        ]),
        "Debt"
      )
    ).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("destination accounts")
    });
    expect(deriveRemainingObligations(budgetView(null))).toBeNull();
  });
});
