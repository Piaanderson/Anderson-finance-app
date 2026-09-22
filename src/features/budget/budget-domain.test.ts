import { describe, expect, it } from "vitest";
import type {
  HouseholdMovement,
  MovementCategory,
  MovementDirection,
  MovementLeg
} from "@/features/transactions/movements";
import {
  budgetMonthKey,
  calculateBudget,
  parseBudgetMonthKey,
  shiftBudgetMonth,
  type BudgetCalculationAllocation
} from "./budget-domain";

const usd = { kind: "ISO" as const, code: "USD" };

function leg({
  id,
  accountId,
  direction,
  value,
  role = "SINGLE"
}: {
  id: string;
  accountId: string;
  direction: MovementDirection;
  value: string;
  role?: MovementLeg["role"];
}): MovementLeg {
  return {
    transactionId: id,
    role,
    direction,
    account: {
      id: accountId,
      name: accountId,
      mask: null,
      active: true
    },
    postedDate: "2026-09-10T00:00:00.000Z",
    authorizedDate: null,
    effectiveDate: "2026-09-10T00:00:00.000Z",
    pending: false,
    amount: { value, currency: usd },
    plaidAmount: direction === "INFLOW" ? `-${value}` : value,
    name: id,
    merchantName: null,
    bankDescription: null,
    paymentMemo: null,
    referenceNumber: null,
    paymentChannel: null,
    transactionCode: null,
    checkNumber: null
  };
}

function transaction({
  id,
  direction,
  value,
  category = null,
  currency = usd
}: {
  id: string;
  direction: MovementDirection;
  value: string;
  category?: MovementCategory | null;
  currency?: MovementLeg["amount"]["currency"];
}): HouseholdMovement {
  const transactionLeg = leg({
    id,
    accountId: "checking",
    direction,
    value
  });
  transactionLeg.amount.currency = currency;
  return {
    id: `transaction:${id}`,
    kind: "TRANSACTION",
    direction,
    category,
    canonicalDate: transactionLeg.effectiveDate,
    description: id,
    pending: false,
    amounts: [transactionLeg.amount],
    legs: [transactionLeg]
  };
}

function transfer({
  id,
  destinationAccountId,
  value
}: {
  id: string;
  destinationAccountId: string;
  value: string;
}): HouseholdMovement {
  const outgoing = leg({
    id: `${id}-out`,
    accountId: "checking",
    direction: "OUTFLOW",
    value,
    role: "OUTGOING"
  });
  const incoming = leg({
    id: `${id}-in`,
    accountId: destinationAccountId,
    direction: "INFLOW",
    value,
    role: "INCOMING"
  });
  return {
    id: `transfer:${id}`,
    kind: "TRANSFER",
    direction: "INTERNAL",
    category: null,
    matchId: id,
    canonicalDate: outgoing.effectiveDate,
    description: id,
    pending: false,
    amounts: [outgoing.amount],
    legs: [outgoing, incoming]
  };
}

function allocation(
  values: Partial<BudgetCalculationAllocation> &
    Pick<BudgetCalculationAllocation, "id" | "categoryId" | "section">
): BudgetCalculationAllocation {
  return {
    categoryName: values.categoryId,
    sortOrder: 0,
    planned: "100.00",
    destinationAccountId: null,
    ...values
  };
}

function category(id: string, section: MovementCategory["section"]) {
  return { id, name: id, section, archived: false };
}

describe("monthly budget calculations", () => {
  it("reconciles income, plan, categorized activity, transfers, and due amounts", () => {
    const result = calculateBudget({
      incomePlan: "1000.00",
      allocations: [
        allocation({
          id: "debt-allocation",
          categoryId: "debt",
          section: "Debt",
          planned: "400.00",
          destinationAccountId: "card"
        }),
        allocation({
          id: "savings-allocation",
          categoryId: "savings",
          section: "Savings",
          planned: "300.00",
          destinationAccountId: "savings"
        }),
        allocation({
          id: "needs-allocation",
          categoryId: "needs",
          section: "Needs",
          planned: "500.00"
        }),
        allocation({
          id: "flex-allocation",
          categoryId: "flex",
          section: "Flex",
          planned: "200.00"
        })
      ],
      movements: [
        transfer({
          id: "card-payment",
          destinationAccountId: "card",
          value: "250.00"
        }),
        transfer({
          id: "savings-move",
          destinationAccountId: "savings",
          value: "100.00"
        }),
        transaction({
          id: "needs-spend",
          direction: "OUTFLOW",
          value: "300.00",
          category: category("needs", "Needs")
        }),
        transaction({
          id: "needs-refund",
          direction: "INFLOW",
          value: "50.00",
          category: category("needs", "Needs")
        }),
        transaction({
          id: "flex-spend",
          direction: "OUTFLOW",
          value: "240.00",
          category: category("flex", "Flex")
        }),
        transaction({
          id: "paycheck",
          direction: "INFLOW",
          value: "1000.00"
        }),
        transaction({
          id: "uncategorized",
          direction: "OUTFLOW",
          value: "25.00"
        })
      ]
    });

    expect(result).toMatchObject({
      incomePlan: "1000.00",
      observedIncome: "1000.00",
      totalPlanned: "1400.00",
      leftToBudget: "-400.00",
      unassignedSpending: "25.00",
      unallocatedCategorizedSpending: "0.00"
    });
    expect(result.sections).toEqual([
      expect.objectContaining({
        section: "Debt",
        planned: "400.00",
        activity: "250.00",
        remaining: "150.00",
        over: "0.00",
        activityLabel: "moved",
        remainingLabel: "due"
      }),
      expect.objectContaining({
        section: "Savings",
        activity: "100.00",
        remaining: "200.00"
      }),
      expect.objectContaining({
        section: "Needs",
        activity: "250.00",
        remaining: "250.00",
        activityLabel: "paid"
      }),
      expect.objectContaining({
        section: "Flex",
        activity: "240.00",
        remaining: "0.00",
        over: "40.00",
        activityLabel: "spent",
        remainingLabel: "left"
      })
    ]);
  });

  it("counts a transfer once when allocations share one destination", () => {
    const result = calculateBudget({
      incomePlan: "200.00",
      allocations: [
        allocation({
          id: "debt",
          categoryId: "debt",
          section: "Debt",
          destinationAccountId: "shared"
        }),
        allocation({
          id: "savings",
          categoryId: "savings",
          section: "Savings",
          destinationAccountId: "shared"
        })
      ],
      movements: [
        transfer({
          id: "shared-transfer",
          destinationAccountId: "shared",
          value: "150.00"
        })
      ]
    });

    expect(result.sections[0].rows[0].activity).toBe("100.00");
    expect(result.sections[1].rows[0].activity).toBe("50.00");
    expect(
      result.sections.reduce(
        (total, section) => total + Number(section.activity),
        0
      )
    ).toBe(150);
  });

  it("excludes non-USD movements and surfaces spending without an allocation", () => {
    const result = calculateBudget({
      incomePlan: "100.00",
      allocations: [],
      movements: [
        transaction({
          id: "cad-income",
          direction: "INFLOW",
          value: "50.00",
          currency: { kind: "ISO", code: "CAD" }
        }),
        transaction({
          id: "unallocated",
          direction: "OUTFLOW",
          value: "20.00",
          category: category("not-in-plan", "Needs")
        })
      ]
    });

    expect(result.observedIncome).toBe("0.00");
    expect(result.unallocatedCategorizedSpending).toBe("20.00");
  });

  it("rejects negative plan values", () => {
    expect(() =>
      calculateBudget({
        incomePlan: "-1.00",
        allocations: [],
        movements: []
      })
    ).toThrow("Budget income cannot be negative");
    expect(() =>
      calculateBudget({
        incomePlan: "1.00",
        allocations: [
          allocation({
            id: "negative",
            categoryId: "negative",
            section: "Needs",
            planned: "-1.00"
          })
        ],
        movements: []
      })
    ).toThrow("cannot be negative");
  });
});

describe("budget month identity", () => {
  it("parses, formats, and shifts canonical UTC month keys", () => {
    const september = parseBudgetMonthKey("2026-09");
    expect(september?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(budgetMonthKey(shiftBudgetMonth(september!, -1))).toBe("2026-08");
    expect(budgetMonthKey(shiftBudgetMonth(september!, 1))).toBe("2026-10");
    expect(parseBudgetMonthKey("2026-13")).toBeNull();
    expect(parseBudgetMonthKey("26-09")).toBeNull();
  });
});
