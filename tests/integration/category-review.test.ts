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

import { PUT as categorizeTransaction } from "@/app/api/transactions/[transactionId]/category/route";
import { getHouseholdCategoryReviewData } from "@/features/categories/category-data";
import { prisma } from "@/server/db";

const key = `category-review-${randomUUID()}`;
const ids = {
  userA: `${key}-user-a`,
  userB: `${key}-user-b`,
  householdA: `${key}-household-a`,
  householdB: `${key}-household-b`,
  itemA: `${key}-item-a`,
  itemB: `${key}-item-b`,
  accountA: `${key}-account-a`,
  accountB: `${key}-account-b`,
  needs: `${key}-needs`,
  flex: `${key}-flex`,
  archived: `${key}-archived`,
  invalid: `${key}-invalid`,
  foreignCategory: `${key}-foreign-category`,
  transaction: `${key}-transaction`,
  removedTransaction: `${key}-removed-transaction`,
  foreignTransaction: `${key}-foreign-transaction`
};

function request(
  transactionId: string,
  categoryId: string,
  createRule: boolean
) {
  return categorizeTransaction(
    new Request("http://currents.test/api/transactions/category", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId, createRule })
    }),
    { params: Promise.resolve({ transactionId }) }
  );
}

async function createFixtures() {
  await prisma.user.createMany({
    data: [
      { id: ids.userA, email: `${key}-a@example.test` },
      { id: ids.userB, email: `${key}-b@example.test` }
    ]
  });
  await prisma.household.createMany({
    data: [
      { id: ids.householdA, name: "Category review A" },
      { id: ids.householdB, name: "Category review B" }
    ]
  });
  await prisma.householdMember.createMany({
    data: [
      {
        id: `${key}-member-a`,
        householdId: ids.householdA,
        userId: ids.userA,
        role: "OWNER"
      },
      {
        id: `${key}-member-b`,
        householdId: ids.householdB,
        userId: ids.userB,
        role: "OWNER"
      }
    ]
  });
  await prisma.plaidItem.createMany({
    data: [
      {
        id: ids.itemA,
        householdId: ids.householdA,
        linkedByUserId: ids.userA,
        plaidItemId: `${key}-plaid-a`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      },
      {
        id: ids.itemB,
        householdId: ids.householdB,
        linkedByUserId: ids.userB,
        plaidItemId: `${key}-plaid-b`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    ]
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: ids.accountA,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${key}-plaid-account-a`,
        source: "PLAID",
        classification: "CASH",
        name: "A checking",
        type: "depository"
      },
      {
        id: ids.accountB,
        householdId: ids.householdB,
        plaidItemId: ids.itemB,
        plaidAccountId: `${key}-plaid-account-b`,
        source: "PLAID",
        classification: "CASH",
        name: "B checking",
        type: "depository"
      }
    ]
  });
  await prisma.category.createMany({
    data: [
      {
        id: ids.needs,
        householdId: ids.householdA,
        name: "Utilities",
        section: "Needs",
        sortOrder: 2
      },
      {
        id: ids.flex,
        householdId: ids.householdA,
        name: "Dining",
        section: "Flex",
        sortOrder: 1
      },
      {
        id: ids.archived,
        householdId: ids.householdA,
        name: "Old category",
        section: "Debt",
        archivedAt: new Date()
      },
      {
        id: ids.invalid,
        householdId: ids.householdA,
        name: "Legacy other",
        section: "Other"
      },
      {
        id: ids.foreignCategory,
        householdId: ids.householdB,
        name: "Foreign category",
        section: "Needs"
      }
    ]
  });
  await prisma.transaction.createMany({
    data: [
      {
        id: ids.transaction,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${key}-plaid-transaction`,
        name: "CAFE MARKET 123",
        merchantName: "  CAFÉ\u00a0  MARKET ",
        amount: "12.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-12T00:00:00.000Z")
      },
      {
        id: ids.removedTransaction,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${key}-plaid-removed`,
        name: "REMOVED",
        amount: "15.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-12T00:00:00.000Z"),
        removedAt: new Date()
      },
      {
        id: ids.foreignTransaction,
        householdId: ids.householdB,
        accountId: ids.accountB,
        plaidTransactionId: `${key}-plaid-foreign`,
        name: "FOREIGN",
        amount: "20.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-12T00:00:00.000Z")
      }
    ]
  });
  await prisma.merchantRule.createMany({
    data: [
      {
        id: `${key}-active-rule`,
        householdId: ids.householdA,
        categoryId: ids.needs,
        merchantKey: "café market"
      },
      {
        id: `${key}-archived-rule`,
        householdId: ids.householdA,
        categoryId: ids.archived,
        merchantKey: "archived merchant"
      },
      {
        id: `${key}-foreign-rule`,
        householdId: ids.householdB,
        categoryId: ids.foreignCategory,
        merchantKey: "foreign"
      }
    ]
  });
}

beforeAll(async () => {
  mocks.owner.userId = ids.userA;
  mocks.owner.householdId = ids.householdA;
  await createFixtures();
});

afterAll(async () => {
  await prisma.household.deleteMany({
    where: { id: { in: [ids.householdA, ids.householdB] } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.userA, ids.userB] } }
  });
  await prisma.$disconnect();
});

describe("household category review data", () => {
  it("returns active validated categories and rules in product order", async () => {
    const result = await getHouseholdCategoryReviewData(ids.householdA);

    expect(result.categories).toEqual([
      {
        id: ids.needs,
        name: "Utilities",
        section: "Needs",
        sortOrder: 2
      },
      {
        id: ids.flex,
        name: "Dining",
        section: "Flex",
        sortOrder: 1
      }
    ]);
    expect(result.rules).toEqual([
      {
        id: `${key}-active-rule`,
        merchantKey: "café market",
        category: { id: ids.needs, name: "Utilities" }
      }
    ]);
    expect(JSON.stringify(result)).not.toContain(ids.foreignCategory);
    expect(JSON.stringify(result)).not.toContain(ids.archived);
    expect(JSON.stringify(result)).not.toContain(ids.invalid);
  });
});

describe("category assignment boundary", () => {
  it("assigns one transaction and removes an existing rule when unchecked", async () => {
    const response = await request(ids.transaction, ids.flex, false);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      categorized: true,
      rule: { active: false, merchantKey: "café market" }
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { id: ids.transaction }
      })
    ).resolves.toMatchObject({ categoryId: ids.flex });
    await expect(
      prisma.merchantRule.findUnique({
        where: {
          householdId_merchantKey: {
            householdId: ids.householdA,
            merchantKey: "café market"
          }
        }
      })
    ).resolves.toBeNull();
  });

  it("creates and deterministically updates one exact merchant rule", async () => {
    expect((await request(ids.transaction, ids.needs, true)).status).toBe(200);
    expect((await request(ids.transaction, ids.flex, true)).status).toBe(200);

    const rules = await prisma.merchantRule.findMany({
      where: {
        householdId: ids.householdA,
        merchantKey: "café market"
      }
    });
    expect(rules).toHaveLength(1);
    expect(rules[0].categoryId).toBe(ids.flex);
  });

  it.each([
    ["a foreign transaction", ids.foreignTransaction, ids.needs],
    ["a foreign category", ids.transaction, ids.foreignCategory],
    ["an archived category", ids.transaction, ids.archived],
    ["a removed transaction", ids.removedTransaction, ids.needs]
  ])("returns 404 for %s", async (_label, transactionId, categoryId) => {
    const response = await request(transactionId, categoryId, true);
    expect(response.status).toBe(404);
  });
});
