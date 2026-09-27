import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getHouseholdDashboard } from "@/features/dashboard/dashboard-data";
import { prisma } from "@/server/db";

const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

async function createHousehold(name: string) {
  const id = `dashboard-${randomUUID()}`;
  createdHouseholds.push(id);
  await prisma.household.create({ data: { id, name } });
  return id;
}

afterEach(async () => {
  const householdIds = createdHouseholds.splice(0);
  await prisma.household.deleteMany({
    where: { id: { in: householdIds } }
  });
  const userIds = createdUsers.splice(0);
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("household Home dashboard read", () => {
  it("isolates households and traces current, past, future, archived, pending, transfer, snapshot, and currency states", async () => {
    const householdId = await createHousehold("Dashboard household");
    const foreignHouseholdId = await createHousehold("Foreign dashboard");
    const emptyHouseholdId = await createHousehold("Empty dashboard");
    const prefix = `home-${randomUUID()}`;
    const accountIds = {
      checking: `${prefix}-checking`,
      savings: `${prefix}-savings`,
      debt: `${prefix}-debt`,
      archived: `${prefix}-archived`,
      foreign: `${prefix}-foreign`
    };
    const categoryIds = {
      needs: `${prefix}-needs`,
      flexArchived: `${prefix}-flex-archived`,
      savings: `${prefix}-savings-category`,
      debt: `${prefix}-debt-category`,
      foreign: `${prefix}-foreign-category`
    };

    await prisma.financialAccount.createMany({
      data: [
        {
          id: accountIds.checking,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Home checking",
          currentBalance: "120.00",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.savings,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Home savings",
          currentBalance: "70.00",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.debt,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Home card",
          currentBalance: "-20.00",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.archived,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Archived checking",
          currentBalance: "5.00",
          isoCurrencyCode: "USD",
          isActive: false,
          archivedAt: new Date("2026-09-01T00:00:00.000Z")
        },
        {
          id: accountIds.foreign,
          householdId: foreignHouseholdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Foreign checking",
          currentBalance: "999999.00",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.category.createMany({
      data: [
        {
          id: categoryIds.needs,
          householdId,
          name: "Groceries",
          section: "Needs"
        },
        {
          id: categoryIds.flexArchived,
          householdId,
          name: "Old dining",
          section: "Flex",
          archivedAt: new Date("2026-09-10T00:00:00.000Z")
        },
        {
          id: categoryIds.savings,
          householdId,
          name: "Vacation",
          section: "Savings"
        },
        {
          id: categoryIds.debt,
          householdId,
          name: "Card paydown",
          section: "Debt"
        },
        {
          id: categoryIds.foreign,
          householdId: foreignHouseholdId,
          name: "Foreign category",
          section: "Needs"
        }
      ]
    });
    await prisma.budgetMonth.create({
      data: {
        id: `${prefix}-budget`,
        householdId,
        month: new Date("2026-09-01T00:00:00.000Z"),
        income: "300.00",
        allocations: {
          create: [
            {
              categoryId: categoryIds.debt,
              planned: "50.00",
              destinationAccountId: accountIds.debt
            },
            {
              categoryId: categoryIds.savings,
              planned: "40.00",
              destinationAccountId: accountIds.savings
            },
            {
              categoryId: categoryIds.needs,
              planned: "150.00",
              destinationAccountId: accountIds.checking
            },
            {
              categoryId: categoryIds.flexArchived,
              planned: "10.00",
              destinationAccountId: accountIds.checking
            }
          ]
        }
      }
    });

    const transferIds = {
      debtOut: `${prefix}-debt-out`,
      debtIn: `${prefix}-debt-in`,
      savingsOut: `${prefix}-savings-out`,
      savingsIn: `${prefix}-savings-in`
    };
    await prisma.transaction.createMany({
      data: [
        {
          id: `${prefix}-aug-income`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-aug-income`,
          name: "August payroll",
          amount: "-80.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-08-02T00:00:00.000Z")
        },
        {
          id: `${prefix}-aug-spending`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-aug-spending`,
          name: "August groceries",
          amount: "50.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.needs,
          date: new Date("2026-08-03T00:00:00.000Z")
        },
        {
          id: `${prefix}-income`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-income`,
          name: "September payroll",
          amount: "-100.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-02T00:00:00.000Z")
        },
        {
          id: `${prefix}-spending`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-spending`,
          name: "September groceries",
          amount: "40.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.needs,
          pending: true,
          date: new Date("2026-09-03T00:00:00.000Z")
        },
        {
          id: `${prefix}-archived-category-spending`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-archived-category`,
          name: "Archived category purchase",
          amount: "5.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.flexArchived,
          date: new Date("2026-09-04T00:00:00.000Z")
        },
        {
          id: `${prefix}-archived-account-spending`,
          householdId,
          accountId: accountIds.archived,
          plaidTransactionId: `${prefix}-plaid-archived-account`,
          name: "Historical account purchase",
          amount: "3.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.needs,
          date: new Date("2026-09-05T00:00:00.000Z")
        },
        {
          id: transferIds.debtOut,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-debt-out`,
          name: "Card payment",
          amount: "30.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-06T00:00:00.000Z")
        },
        {
          id: transferIds.debtIn,
          householdId,
          accountId: accountIds.debt,
          plaidTransactionId: `${prefix}-plaid-debt-in`,
          name: "Payment received",
          amount: "-30.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-06T00:00:00.000Z")
        },
        {
          id: transferIds.savingsOut,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${prefix}-plaid-savings-out`,
          name: "Savings transfer",
          amount: "20.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-07T00:00:00.000Z")
        },
        {
          id: transferIds.savingsIn,
          householdId,
          accountId: accountIds.savings,
          plaidTransactionId: `${prefix}-plaid-savings-in`,
          name: "Savings deposit",
          amount: "-20.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-07T00:00:00.000Z")
        },
        {
          id: `${prefix}-foreign-spending`,
          householdId: foreignHouseholdId,
          accountId: accountIds.foreign,
          plaidTransactionId: `${prefix}-plaid-foreign-spending`,
          name: "Foreign large purchase",
          amount: "999999.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.foreign,
          date: new Date("2026-09-03T00:00:00.000Z")
        }
      ]
    });
    await prisma.transaction.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        id: `${prefix}-bulk-${index}`,
        householdId,
        accountId: accountIds.checking,
        plaidTransactionId: `${prefix}-plaid-bulk-${index}`,
        name: `Bulk purchase ${index}`,
        amount: "1.00",
        isoCurrencyCode: "USD",
        categoryId: categoryIds.needs,
        date: new Date("2026-09-09T00:00:00.000Z")
      }))
    });
    await prisma.transferMatch.createMany({
      data: [
        {
          id: `${prefix}-debt-match`,
          householdId,
          outgoingTransactionId: transferIds.debtOut,
          incomingTransactionId: transferIds.debtIn
        },
        {
          id: `${prefix}-savings-match`,
          householdId,
          outgoingTransactionId: transferIds.savingsOut,
          incomingTransactionId: transferIds.savingsIn
        }
      ]
    });

    const firstSnapshotAt = new Date("2026-08-10T12:00:00.000Z");
    const secondSnapshotAt = new Date("2026-09-10T12:00:00.000Z");
    await prisma.accountPositionSnapshot.createMany({
      data: [
        [accountIds.checking, "100.00", firstSnapshotAt, "checking-aug"],
        [accountIds.savings, "50.00", firstSnapshotAt, "savings-aug"],
        [accountIds.debt, "-30.00", firstSnapshotAt, "debt-aug"],
        [accountIds.checking, "120.00", secondSnapshotAt, "checking-sep"],
        [accountIds.savings, "70.00", secondSnapshotAt, "savings-sep"],
        [accountIds.debt, "-20.00", secondSnapshotAt, "debt-sep"]
      ].map(([accountId, signedBalance, effectiveAt, suffix]) => ({
        householdId,
        accountId: accountId as string,
        signedBalance: signedBalance as string,
        isoCurrencyCode: "USD",
        effectiveAt: effectiveAt as Date,
        observedAt: effectiveAt as Date,
        source: "MANUAL" as const,
        dedupeKey: `${prefix}-${suffix}`
      }))
    });

    const september = await getHouseholdDashboard({
      householdId,
      month: new Date("2026-09-01T00:00:00.000Z"),
      now: new Date("2026-09-12T18:00:00.000Z")
    });
    expect(september.selectedMonth.pace).toMatchObject({
      state: "in-progress",
      day: 12
    });
    expect(september.movementCount).toBe(107);
    expect(september.recentMovements).toHaveLength(5);
    expect(september.cashFlow).toMatchObject([
      {
        income: "100.00",
        spending: "149.00",
        comparisonIncome: "80.00",
        comparisonSpending: "50.00"
      }
    ]);
    expect(september.cashFlow.some((row) => row.spending === "999999.00")).toBe(
      false
    );
    expect(september.pendingMovementCount).toBe(1);
    expect(september.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryName: "Groceries",
          spending: "144.00"
        }),
        expect.objectContaining({
          categoryName: "Old dining",
          categoryArchived: true,
          spending: "5.00"
        })
      ])
    );
    expect(september.savingsMovement).toMatchObject({
      status: "available",
      amount: "20.00"
    });
    expect(september.debtPaydown).toMatchObject({
      status: "available",
      amount: "30.00"
    });
    expect(september.remainingObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryName: "Card paydown",
          amount: "20.00"
        }),
        expect.objectContaining({ categoryName: "Vacation", amount: "20.00" }),
        expect.objectContaining({ categoryName: "Groceries", amount: "6.00" })
      ])
    );
    expect(september.currentPositions.totals).toEqual([
      { currency: "USD", amount: "170.00" }
    ]);
    expect(september.netWorthPeriodChange).toMatchObject({
      status: "available",
      selectedAmount: "170.00",
      comparisonAmount: "120.00",
      change: { value: "50.00" }
    });

    const august = await getHouseholdDashboard({
      householdId,
      month: new Date("2026-08-01T00:00:00.000Z"),
      now: new Date("2026-09-12T18:00:00.000Z")
    });
    expect(august.selectedMonth.pace).toMatchObject({
      state: "complete",
      day: 31
    });
    expect(august.cashFlow).toMatchObject([
      { income: "80.00", spending: "50.00" }
    ]);

    const october = await getHouseholdDashboard({
      householdId,
      month: new Date("2026-10-01T00:00:00.000Z"),
      now: new Date("2026-09-12T18:00:00.000Z")
    });
    expect(october.selectedMonth.pace.state).toBe("not-started");
    expect(october.cashFlow).toEqual([]);
    expect(october.netWorthPeriodChange.status).toBe("unavailable");
    expect(october.budget.plan).toBeNull();
    expect(october.remainingObligations).toBeNull();

    const empty = await getHouseholdDashboard({
      householdId: emptyHouseholdId,
      month: new Date("2026-09-01T00:00:00.000Z"),
      now: new Date("2026-09-12T18:00:00.000Z")
    });
    expect(empty.currentPositions).toMatchObject({
      accountCount: 0,
      totals: [],
      isComplete: true
    });
    expect(empty.netWorthHistory.status).toBe("unavailable");
    expect(empty.cashFlow).toEqual([]);
    expect(empty.categories).toEqual([]);
    expect(empty.budget.plan).toBeNull();

    const cadId = `${prefix}-cad`;
    const incompleteId = `${prefix}-incomplete`;
    const plaidUserId = `${prefix}-plaid-user`;
    const plaidItemId = `${prefix}-plaid-item`;
    createdUsers.push(plaidUserId);
    await prisma.user.create({
      data: { id: plaidUserId, email: `${plaidUserId}@example.test` }
    });
    await prisma.plaidItem.create({
      data: {
        id: plaidItemId,
        householdId,
        linkedByUserId: plaidUserId,
        plaidItemId: `${prefix}-provider-item`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: cadId,
          householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Canadian investment",
          currentBalance: "50.00",
          isoCurrencyCode: "CAD"
        },
        {
          id: incompleteId,
          householdId,
          source: "PLAID",
          classification: "PROPERTY",
          name: "Incomplete property",
          plaidItemId,
          plaidAccountId: `${prefix}-incomplete-provider-account`,
          type: "other",
          currentBalance: null,
          isoCurrencyCode: "USD"
        }
      ]
    });
    const incomplete = await getHouseholdDashboard({
      householdId,
      month: new Date("2026-09-01T00:00:00.000Z"),
      now: new Date("2026-09-12T18:00:00.000Z")
    });
    expect(incomplete.currentPositions.totals).toEqual([
      { currency: "CAD", amount: "50.00" },
      { currency: "USD", amount: "170.00" }
    ]);
    expect(incomplete.currentPositions.isComplete).toBe(false);
    expect(incomplete.currentPositions.missingBalanceAccountIds).toContain(
      incompleteId
    );
    expect(incomplete.netWorthHistory.status).toBe("unavailable");
    expect(incomplete.netWorthPeriodChange.status).toBe("unavailable");
  });
});
