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
      currency: "USD"
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
