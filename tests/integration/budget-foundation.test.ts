import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: {
    userId: "",
    householdId: "",
    role: "OWNER" as const
  }
}));

vi.mock("@/server/households", () => ({
  requireApiHousehold: vi.fn(async () => mocks.owner)
}));

import { PUT as updateAllocation } from "@/app/api/budget/allocations/[allocationId]/route";
import { PUT as updateIncome } from "@/app/api/budget/months/[budgetMonthId]/route";
import { POST as copyBudgetMonth } from "@/app/api/budget/months/copy/route";
import { getHouseholdBudgetView } from "@/features/budget/budget-data";
import { prisma } from "@/server/db";

const key = `budget-foundation-${randomUUID()}`;
const ids = {
  user: `${key}-user`,
  household: `${key}-household`,
  category: `${key}-category`,
  categoryTwo: `${key}-category-two`,
  archivedCategory: `${key}-archived-category`,
  mortgageCategory: `${key}-mortgage-category`,
  account: `${key}-account`,
  inactiveAccount: `${key}-inactive-account`,
  propertyAccount: `${key}-property-account`,
  mortgageAccount: `${key}-mortgage-account`,
  propertyLink: `${key}-property-link`,
  september: `${key}-september`,
  vacationAllocation: `${key}-vacation-allocation`,
  debtAllocation: `${key}-debt-allocation`,
  mortgageAllocation: `${key}-mortgage-allocation`
};

function copyRequest(sourceMonth: string, targetMonth: string) {
  return copyBudgetMonth(
    new Request("http://currents.test/api/budget/months/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceMonth, targetMonth })
    })
  );
}

function editRequest(body: Record<string, unknown>) {
  return new Request("http://currents.test/api/budget/edit", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  mocks.owner.userId = ids.user;
  mocks.owner.householdId = ids.household;
  await prisma.user.create({
    data: { id: ids.user, email: `${key}@example.test` }
  });
  await prisma.household.create({
    data: {
      id: ids.household,
      name: "Budget foundation",
      members: {
        create: {
          id: `${key}-membership`,
          userId: ids.user,
          role: "OWNER"
        }
      }
    }
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: ids.account,
        householdId: ids.household,
        source: "MANUAL",
        classification: "CASH",
        name: "Active savings",
        currentBalance: "500.00",
        isoCurrencyCode: "USD"
      },
      {
        id: ids.inactiveAccount,
        householdId: ids.household,
        source: "MANUAL",
        classification: "DEBT",
        name: "Inactive card",
        currentBalance: "-100.00",
        isoCurrencyCode: "USD",
        isActive: false,
        archivedAt: new Date()
      },
      {
        id: ids.propertyAccount,
        householdId: ids.household,
        source: "MANUAL",
        classification: "PROPERTY",
        name: "Primary home",
        currentBalance: "412000.00",
        isoCurrencyCode: "USD"
      },
      {
        id: ids.mortgageAccount,
        householdId: ids.household,
        source: "MANUAL",
        classification: "DEBT",
        name: "Home mortgage",
        currentBalance: "-287400.00",
        isoCurrencyCode: "USD"
      }
    ]
  });
  await prisma.propertyDebtLink.create({
    data: {
      id: ids.propertyLink,
      householdId: ids.household,
      propertyAccountId: ids.propertyAccount,
      debtAccountId: ids.mortgageAccount
    }
  });
  await prisma.category.createMany({
    data: [
      {
        id: ids.category,
        householdId: ids.household,
        name: "Vacation",
        section: "Savings"
      },
      {
        id: ids.categoryTwo,
        householdId: ids.household,
        name: "Card",
        section: "Debt"
      },
      {
        id: ids.archivedCategory,
        householdId: ids.household,
        name: "Old goal",
        section: "Savings",
        archivedAt: new Date()
      },
      {
        id: ids.mortgageCategory,
        householdId: ids.household,
        name: "Mortgage",
        section: "Needs"
      }
    ]
  });
  await prisma.budgetMonth.create({
    data: {
      id: ids.september,
      householdId: ids.household,
      month: new Date("2026-09-01T00:00:00.000Z"),
      income: "8240.00",
      allocations: {
        create: [
          {
            id: ids.vacationAllocation,
            categoryId: ids.category,
            planned: "300.00",
            destinationAccountId: ids.account
          },
          {
            id: ids.debtAllocation,
            categoryId: ids.categoryTwo,
            planned: "400.00",
            destinationAccountId: ids.inactiveAccount
          },
          {
            categoryId: ids.archivedCategory,
            planned: "100.00"
          },
          {
            id: ids.mortgageAllocation,
            categoryId: ids.mortgageCategory,
            planned: "2180.00",
            destinationAccountId: ids.mortgageAccount
          }
        ]
      }
    }
  });
});

afterAll(async () => {
  await prisma.household.deleteMany({ where: { id: ids.household } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("previous-month budget copy", () => {
  it("copies income and active categories without retaining inactive destinations", async () => {
    const response = await copyRequest("2026-09", "2026-10");
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      month: "2026-10",
      allocationsCopied: 3
    });

    const october = await prisma.budgetMonth.findUniqueOrThrow({
      where: {
        householdId_month: {
          householdId: ids.household,
          month: new Date("2026-10-01T00:00:00.000Z")
        }
      },
      include: { allocations: true }
    });
    expect(october.income.toFixed(2)).toBe("8240.00");
    expect(october.allocations).toHaveLength(3);
    expect(
      october.allocations.find(
        (allocation) => allocation.categoryId === ids.category
      )?.destinationAccountId
    ).toBe(ids.account);
    expect(
      october.allocations.find(
        (allocation) => allocation.categoryId === ids.categoryTwo
      )?.destinationAccountId
    ).toBeNull();
    expect(
      october.allocations.some(
        (allocation) => allocation.categoryId === ids.archivedCategory
      )
    ).toBe(false);
  });

  it("returns stable validation, missing-source, and existing-target responses", async () => {
    expect((await copyRequest("2026-09", "2026-11")).status).toBe(400);
    expect((await copyRequest("2026-08", "2026-09")).status).toBe(404);
    expect((await copyRequest("2026-09", "2026-10")).status).toBe(409);
  });

  it("lets the unique month constraint arbitrate concurrent copies", async () => {
    const responses = await Promise.all([
      copyRequest("2026-10", "2026-11"),
      copyRequest("2026-10", "2026-11")
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409
    ]);
    expect(
      await prisma.budgetMonth.count({
        where: {
          householdId: ids.household,
          month: new Date("2026-11-01T00:00:00.000Z")
        }
      })
    ).toBe(1);
  });
});

describe("household budget read", () => {
  it("provides dynamic month identity and copy availability", async () => {
    const september = await getHouseholdBudgetView({
      householdId: ids.household,
      month: new Date("2026-09-01T00:00:00.000Z")
    });
    expect(september).toMatchObject({
      monthKey: "2026-09",
      monthLabel: "September 2026",
      previousMonthKey: "2026-08",
      nextMonthKey: "2026-10",
      previousPlanExists: false
    });
    expect(september.plan?.calculation.totalPlanned).toBe("2980.00");
    expect(september.plan?.destinations[ids.mortgageAllocation]).toMatchObject({
      name: "Home mortgage",
      currentBalance: "-287400.00",
      relatedProperties: [
        {
          name: "Primary home",
          currentBalance: "412000.00"
        }
      ]
    });

    const december = await getHouseholdBudgetView({
      householdId: ids.household,
      month: new Date("2026-12-01T00:00:00.000Z")
    });
    expect(december.plan).toBeNull();
    expect(december.previousPlanExists).toBe(true);
  });
});

describe("budget editing", () => {
  it("validates and persists exact income with stale-write conflict handling", async () => {
    const month = await prisma.budgetMonth.findUniqueOrThrow({
      where: { id: ids.september },
      select: { updatedAt: true }
    });
    const response = await updateIncome(
      editRequest({
        income: "9000.01",
        expectedUpdatedAt: month.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ budgetMonthId: ids.september }) }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      income: "9000.01"
    });
    await expect(
      prisma.budgetMonth.findUniqueOrThrow({ where: { id: ids.september } })
    ).resolves.toMatchObject({ householdId: ids.household });
    expect(
      (
        await prisma.budgetMonth.findUniqueOrThrow({
          where: { id: ids.september }
        })
      ).income.toFixed(2)
    ).toBe("9000.01");

    const conflict = await updateIncome(
      editRequest({
        income: "9100.00",
        expectedUpdatedAt: month.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ budgetMonthId: ids.september }) }
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      code: "BUDGET_EDIT_CONFLICT"
    });

    const invalid = await updateIncome(
      editRequest({
        income: "1.001",
        expectedUpdatedAt: month.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ budgetMonthId: ids.september }) }
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      fieldErrors: { income: expect.any(String) }
    });
  });

  it("persists allocations, validates destinations, and reports reuse", async () => {
    const allocation = await prisma.budgetAllocation.findUniqueOrThrow({
      where: { id: ids.debtAllocation },
      select: { updatedAt: true }
    });
    const response = await updateAllocation(
      editRequest({
        planned: "999.99",
        destinationAccountId: ids.account,
        expectedUpdatedAt: allocation.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ allocationId: ids.debtAllocation }) }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      planned: "999.99",
      warning: expect.stringContaining("also used")
    });
    const saved = await prisma.budgetAllocation.findUniqueOrThrow({
      where: { id: ids.debtAllocation }
    });
    expect(saved.planned.toFixed(2)).toBe("999.99");
    expect(saved.destinationAccountId).toBe(ids.account);

    const conflict = await updateAllocation(
      editRequest({
        planned: "1000.00",
        destinationAccountId: ids.account,
        expectedUpdatedAt: allocation.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ allocationId: ids.debtAllocation }) }
    );
    expect(conflict.status).toBe(409);

    const invalid = await updateAllocation(
      editRequest({
        planned: "1.001",
        destinationAccountId: ids.account,
        expectedUpdatedAt: saved.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ allocationId: ids.debtAllocation }) }
    );
    expect(invalid.status).toBe(400);

    const inactiveDestination = await updateAllocation(
      editRequest({
        planned: "1000.00",
        destinationAccountId: ids.inactiveAccount,
        expectedUpdatedAt: saved.updatedAt.toISOString()
      }),
      { params: Promise.resolve({ allocationId: ids.debtAllocation }) }
    );
    expect(inactiveDestination.status).toBe(422);
  });
});
