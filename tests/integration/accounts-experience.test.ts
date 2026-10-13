import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getAccountOverview } from "@/features/accounts/data";
import { prisma } from "@/server/db";

const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

async function createHousehold(name: string) {
  const id = `accounts-experience-${randomUUID()}`;
  createdHouseholds.push(id);
  await prisma.household.create({ data: { id, name } });
  return id;
}

afterEach(async () => {
  const householdIds = createdHouseholds.splice(0);
  const userIds = createdUsers.splice(0);
  await prisma.household.deleteMany({
    where: { id: { in: householdIds } }
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("household Accounts experience read", () => {
  it("groups and reconciles exact positions, equity, activity, and snapshot history", async () => {
    const householdId = await createHousehold("Accounts experience");
    const foreignHouseholdId = await createHousehold("Foreign accounts");
    const prefix = `accounts-${randomUUID()}`;
    const accountIds = {
      cash: `${prefix}-cash`,
      invested: `${prefix}-invested`,
      property: `${prefix}-property`,
      debt: `${prefix}-debt`,
      foreign: `${prefix}-foreign`
    };
    await prisma.financialAccount.createMany({
      data: [
        {
          id: accountIds.cash,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Checking",
          currentBalance: "110.10",
          availableBalance: "109.10",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.invested,
          householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Roth",
          currentBalance: "200.20",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.property,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Home",
          currentBalance: "1000.30",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.debt,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Mortgage",
          currentBalance: "-400.40",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.foreign,
          householdId: foreignHouseholdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Foreign cash",
          currentBalance: "9999.00",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.propertyDebtLink.create({
      data: {
        householdId,
        propertyAccountId: accountIds.property,
        debtAccountId: accountIds.debt
      }
    });
    await prisma.transaction.create({
      data: {
        householdId,
        accountId: accountIds.cash,
        plaidTransactionId: `${prefix}-transaction`,
        name: "Recent purchase",
        amount: "10.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-20T00:00:00.000Z")
      }
    });

    const firstEffectiveAt = new Date("2026-03-01T12:00:00.000Z");
    const secondEffectiveAt = new Date("2026-04-01T12:00:00.000Z");
    const observedAt = new Date("2026-09-20T18:00:00.000Z");
    await prisma.accountPositionSnapshot.createMany({
      data: [
        ["cash", "100.10"],
        ["invested", "200.20"],
        ["property", "1000.30"],
        ["debt", "-400.40"]
      ].map(([key, signedBalance]) => ({
        householdId,
        accountId: accountIds[key as keyof typeof accountIds],
        signedBalance,
        isoCurrencyCode: "USD",
        effectiveAt: firstEffectiveAt,
        observedAt,
        source: "MANUAL" as const,
        dedupeKey: `${prefix}-${key}-first`
      }))
    });
    await prisma.accountPositionSnapshot.create({
      data: {
        householdId,
        accountId: accountIds.cash,
        signedBalance: "110.10",
        isoCurrencyCode: "USD",
        effectiveAt: secondEffectiveAt,
        observedAt,
        source: "MANUAL",
        dedupeKey: `${prefix}-cash-second`
      }
    });

    const overview = await getAccountOverview(
      householdId,
      new Date("2026-09-26T21:00:00.000Z")
    );

    expect(overview.accounts.map((account) => account.id)).not.toContain(
      accountIds.foreign
    );
    expect(
      new Set(overview.accounts.map((account) => account.classification))
    ).toEqual(new Set(["CASH", "INVESTED", "PROPERTY", "DEBT"]));
    expect(overview.positionSummary.totals).toEqual([
      { currency: "USD", amount: "910.20" }
    ]);
    expect(overview.positionSummary.totalsByClassification).toMatchObject({
      CASH: [{ currency: "USD", amount: "110.10" }],
      INVESTED: [{ currency: "USD", amount: "200.20" }],
      PROPERTY: [{ currency: "USD", amount: "1000.30" }],
      DEBT: [{ currency: "USD", amount: "-400.40" }]
    });
    expect(overview.propertyGroups[0]?.equity).toEqual({
      status: "available",
      amount: "599.90",
      currency: "USD",
      propertyAmount: "1000.30",
      debtAmount: "-400.40",
      isUnderwater: false
    });
    expect(
      overview.accounts.find((account) => account.id === accountIds.cash)
        ?.recentActivity
    ).toMatchObject([{ name: "Recent purchase", displayAmount: "-10.00" }]);
    expect(overview.netWorthHistory).toMatchObject({
      status: "available",
      points: [
        { amount: "900.20", currency: "USD" },
        { amount: "910.20", currency: "USD" }
      ]
    });
  });

  it("excludes hostile cross-household budget relations from account roles", async () => {
    const householdId = await createHousehold("Budget role owner");
    const foreignHouseholdId = await createHousehold("Budget role attacker");
    const prefix = `budget-role-${randomUUID()}`;
    const account = await prisma.financialAccount.create({
      data: {
        id: `${prefix}-account`,
        householdId,
        source: "MANUAL",
        classification: "CASH",
        name: "Owner checking",
        currentBalance: "100.00",
        isoCurrencyCode: "USD"
      }
    });
    await prisma.category.createMany({
      data: [
        {
          id: `${prefix}-owner-category`,
          householdId,
          name: "Owner category",
          section: "Needs"
        },
        {
          id: `${prefix}-foreign-category`,
          householdId: foreignHouseholdId,
          name: "Foreign category",
          section: "Needs"
        }
      ]
    });
    await prisma.budgetMonth.createMany({
      data: [
        {
          id: `${prefix}-owner-month`,
          householdId,
          month: new Date("2026-09-01T00:00:00.000Z"),
          income: "1000.00"
        },
        {
          id: `${prefix}-foreign-month`,
          householdId: foreignHouseholdId,
          month: new Date("2026-09-01T00:00:00.000Z"),
          income: "1000.00"
        }
      ]
    });
    await prisma.budgetAllocation.createMany({
      data: [
        {
          budgetMonthId: `${prefix}-owner-month`,
          categoryId: `${prefix}-owner-category`,
          planned: "100.00",
          destinationAccountId: account.id
        },
        {
          budgetMonthId: `${prefix}-foreign-month`,
          categoryId: `${prefix}-owner-category`,
          planned: "900.00",
          destinationAccountId: account.id
        },
        {
          budgetMonthId: `${prefix}-owner-month`,
          categoryId: `${prefix}-foreign-category`,
          planned: "800.00",
          destinationAccountId: account.id
        }
      ]
    });

    const overview = await getAccountOverview(
      householdId,
      new Date("2026-09-26T21:00:00.000Z")
    );

    expect(
      overview.accounts[0]?.budgetRole.map((role) => role.category)
    ).toEqual(["Owner category"]);
    expect(overview.accounts[0]?.budgetRole[0]?.planned).toBe("100.00");
  });

  it("keeps duplicate-linked debt exact and marks both equities unavailable", async () => {
    const householdId = await createHousehold("Duplicate property links");
    const prefix = `duplicate-links-${randomUUID()}`;
    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${prefix}-home-one`,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Home one",
          currentBalance: "400.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${prefix}-home-two`,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Home two",
          currentBalance: "300.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${prefix}-mortgage`,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Shared mortgage",
          currentBalance: "-500.00",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.propertyDebtLink.createMany({
      data: [
        {
          householdId,
          propertyAccountId: `${prefix}-home-one`,
          debtAccountId: `${prefix}-mortgage`
        },
        {
          householdId,
          propertyAccountId: `${prefix}-home-two`,
          debtAccountId: `${prefix}-mortgage`
        }
      ]
    });

    const overview = await getAccountOverview(
      householdId,
      new Date("2026-09-26T21:00:00.000Z")
    );

    expect(overview.propertyGroups).toHaveLength(2);
    expect(
      overview.propertyGroups.every(
        (group) =>
          group.combineInLedger === false &&
          group.equity.status === "unavailable"
      )
    ).toBe(true);
    expect(overview.ledgerSummary.linkedDebtAccountIds).toEqual([]);
    expect(overview.ledgerSummary.ambiguousLinkedDebtAccountIds).toEqual([
      `${prefix}-mortgage`
    ]);
    expect(overview.ledgerSummary.summary.totals).toEqual([
      { currency: "USD", amount: "200.00" }
    ]);
    expect(overview.positionSummary.totals).toEqual([
      { currency: "USD", amount: "200.00" }
    ]);
  });

  it("preserves mixed-currency and missing linked debt source totals", async () => {
    const householdId = await createHousehold("Unavailable property equity");
    const prefix = `unavailable-equity-${randomUUID()}`;
    const userId = `${prefix}-user`;
    const itemId = `${prefix}-item`;
    createdUsers.push(userId);
    await prisma.user.create({
      data: { id: userId, email: `${prefix}@example.test` }
    });
    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${prefix}-plaid-item`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${prefix}-property`,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Mixed property",
          currentBalance: "400.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${prefix}-cad-debt`,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "CAD mortgage",
          currentBalance: "-200.00",
          isoCurrencyCode: "CAD"
        },
        {
          id: `${prefix}-missing-debt`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${prefix}-plaid-missing-debt`,
          source: "PLAID",
          classification: "DEBT",
          name: "Missing mortgage",
          type: "loan",
          currentBalance: null,
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.propertyDebtLink.createMany({
      data: [
        {
          householdId,
          propertyAccountId: `${prefix}-property`,
          debtAccountId: `${prefix}-cad-debt`
        },
        {
          householdId,
          propertyAccountId: `${prefix}-property`,
          debtAccountId: `${prefix}-missing-debt`
        }
      ]
    });

    const overview = await getAccountOverview(
      householdId,
      new Date("2026-09-26T21:00:00.000Z")
    );

    expect(overview.propertyGroups[0]?.equity).toMatchObject({
      status: "unavailable"
    });
    expect(overview.ledgerSummary.linkedDebtAccountIds).toEqual([]);
    expect(overview.ledgerSummary.uncombinedLinkedDebtAccountIds).toEqual([
      `${prefix}-cad-debt`,
      `${prefix}-missing-debt`
    ]);
    expect(overview.ledgerSummary.summary.totals).toEqual(
      overview.positionSummary.totals
    );
    expect(overview.ledgerSummary.summary.totals).toEqual([
      { currency: "CAD", amount: "-200.00" },
      { currency: "USD", amount: "400.00" }
    ]);
    expect(
      overview.ledgerSummary.summary.totalsByClassification.PROPERTY
    ).toEqual([{ currency: "USD", amount: "400.00" }]);
    expect(overview.ledgerSummary.summary.totalsByClassification.DEBT).toEqual([
      { currency: "CAD", amount: "-200.00" }
    ]);
  });

  it("keeps currencies separate and reports missing values and history honestly", async () => {
    const householdId = await createHousehold("Partial accounts experience");
    const prefix = `partial-${randomUUID()}`;
    const userId = `${prefix}-user`;
    const itemId = `${prefix}-item`;
    createdUsers.push(userId);
    await prisma.user.create({
      data: { id: userId, email: `${prefix}@example.test` }
    });
    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${prefix}-plaid-item`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${prefix}-usd`,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "US cash",
          currentBalance: "100.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${prefix}-cad`,
          householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Canadian investment",
          currentBalance: "50.00",
          isoCurrencyCode: "CAD"
        },
        {
          id: `${prefix}-missing`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${prefix}-plaid-missing`,
          source: "PLAID",
          classification: "PROPERTY",
          name: "Unknown property value",
          type: "other",
          currentBalance: null,
          isoCurrencyCode: "USD"
        }
      ]
    });

    const overview = await getAccountOverview(
      householdId,
      new Date("2026-09-26T21:00:00.000Z")
    );

    expect(overview.positionSummary.totals).toEqual([
      { currency: "CAD", amount: "50.00" },
      { currency: "USD", amount: "100.00" }
    ]);
    expect(overview.positionSummary.missingBalanceAccountIds).toEqual([
      `${prefix}-missing`
    ]);
    expect(overview.positionSummary.isComplete).toBe(false);
    expect(overview.netWorthHistory).toMatchObject({
      status: "unavailable",
      points: []
    });
  });
});
