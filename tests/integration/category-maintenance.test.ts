import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: {
    userId: "",
    householdId: "",
    role: "OWNER" as const
  }
}));

vi.mock("@/server/households", () => ({
  requireHousehold: vi.fn(async () => mocks.owner)
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { maintainCategoryAction } from "@/features/categories/actions";
import { getHouseholdCategoryMaintenanceData } from "@/features/categories/category-data";
import { getHouseholdCategoryReviewData } from "@/features/categories/category-data";
import { prisma } from "@/server/db";

const key = `category-maintenance-${randomUUID()}`;
const ids = {
  userA: `${key}-user-a`,
  userB: `${key}-user-b`,
  householdA: `${key}-household-a`,
  householdB: `${key}-household-b`,
  accountA: `${key}-account-a`,
  accountA2: `${key}-account-a2`,
  needs: `${key}-needs`,
  flex: `${key}-flex`,
  savings: `${key}-savings`,
  archived: `${key}-archived`,
  mergeSource: `${key}-merge-source`,
  mergeTarget: `${key}-merge-target`,
  conflictSource: `${key}-conflict-source`,
  conflictTarget: `${key}-conflict-target`,
  foreign: `${key}-foreign`,
  transaction: `${key}-transaction`,
  mergeTransaction: `${key}-merge-transaction`,
  month: `${key}-month`
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

async function categoryMutation(
  intent: string,
  categoryId: string,
  extra: Record<string, string> = {}
) {
  const maintenance = await getHouseholdCategoryMaintenanceData(
    mocks.owner.householdId
  );
  const category = maintenance.categories.find(
    (entry) => entry.id === categoryId
  );
  return maintainCategoryAction(
    {},
    form({
      intent,
      categoryId,
      expectedListRevision: maintenance.listRevision,
      expectedCategoryRevision: category?.revision ?? new Date(0).toISOString(),
      ...extra
    })
  );
}

beforeAll(async () => {
  mocks.owner.userId = ids.userA;
  mocks.owner.householdId = ids.householdA;
  await prisma.user.createMany({
    data: [
      { id: ids.userA, email: `${key}-a@example.test` },
      { id: ids.userB, email: `${key}-b@example.test` }
    ]
  });
  await prisma.household.createMany({
    data: [
      { id: ids.householdA, name: "Category maintenance A" },
      { id: ids.householdB, name: "Category maintenance B" }
    ]
  });
  await prisma.householdMember.createMany({
    data: [
      {
        id: `${key}-member-a`,
        userId: ids.userA,
        householdId: ids.householdA,
        role: "OWNER"
      },
      {
        id: `${key}-member-b`,
        userId: ids.userB,
        householdId: ids.householdB,
        role: "OWNER"
      }
    ]
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: ids.accountA,
        householdId: ids.householdA,
        source: "MANUAL",
        classification: "CASH",
        name: "Checking",
        currentBalance: "1000.00",
        isoCurrencyCode: "USD"
      },
      {
        id: ids.accountA2,
        householdId: ids.householdA,
        source: "MANUAL",
        classification: "CASH",
        name: "Savings",
        currentBalance: "500.00",
        isoCurrencyCode: "USD"
      }
    ]
  });
  await prisma.category.createMany({
    data: [
      {
        id: ids.needs,
        householdId: ids.householdA,
        name: "Food",
        section: "Needs",
        sortOrder: 0
      },
      {
        id: ids.flex,
        householdId: ids.householdA,
        name: "Dining",
        section: "Flex",
        sortOrder: 0
      },
      {
        id: ids.savings,
        householdId: ids.householdA,
        name: "Vacation",
        section: "Savings",
        sortOrder: 0
      },
      {
        id: ids.archived,
        householdId: ids.householdA,
        name: "Old bills",
        section: "Debt",
        sortOrder: 0,
        archivedAt: new Date()
      },
      {
        id: ids.mergeSource,
        householdId: ids.householdA,
        name: "Coffee",
        section: "Flex",
        sortOrder: 1
      },
      {
        id: ids.mergeTarget,
        householdId: ids.householdA,
        name: "Restaurants",
        section: "Flex",
        sortOrder: 2
      },
      {
        id: ids.conflictSource,
        householdId: ids.householdA,
        name: "Source goal",
        section: "Savings",
        sortOrder: 1
      },
      {
        id: ids.conflictTarget,
        householdId: ids.householdA,
        name: "Target goal",
        section: "Savings",
        sortOrder: 2
      },
      {
        id: ids.foreign,
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
        plaidTransactionId: `${key}-plaid-history`,
        name: "DINING HISTORY",
        amount: "25.00",
        isoCurrencyCode: "USD",
        categoryId: ids.flex,
        date: new Date("2026-09-01T00:00:00.000Z")
      },
      {
        id: ids.mergeTransaction,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${key}-plaid-merge`,
        name: "COFFEE SHOP",
        amount: "5.00",
        isoCurrencyCode: "USD",
        categoryId: ids.mergeSource,
        date: new Date("2026-09-02T00:00:00.000Z")
      }
    ]
  });
  await prisma.merchantRule.createMany({
    data: [
      {
        id: `${key}-flex-rule`,
        householdId: ids.householdA,
        categoryId: ids.flex,
        merchantKey: "dining history"
      },
      {
        id: `${key}-merge-rule`,
        householdId: ids.householdA,
        categoryId: ids.mergeSource,
        merchantKey: "coffee shop"
      },
      {
        id: `${key}-foreign-rule`,
        householdId: ids.householdB,
        categoryId: ids.foreign,
        merchantKey: "foreign merchant"
      }
    ]
  });
  await prisma.budgetMonth.create({
    data: {
      id: ids.month,
      householdId: ids.householdA,
      month: new Date("2026-09-01T00:00:00.000Z"),
      income: "1000.00",
      allocations: {
        create: [
          {
            categoryId: ids.flex,
            planned: "100.00",
            destinationAccountId: ids.accountA
          },
          {
            categoryId: ids.mergeSource,
            planned: "20.10",
            destinationAccountId: ids.accountA
          },
          {
            categoryId: ids.mergeTarget,
            planned: "30.20",
            destinationAccountId: ids.accountA
          },
          {
            categoryId: ids.conflictSource,
            planned: "40.00",
            destinationAccountId: ids.accountA
          },
          {
            categoryId: ids.conflictTarget,
            planned: "50.00",
            destinationAccountId: ids.accountA2
          }
        ]
      }
    }
  });
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

describe.sequential("category maintenance boundaries", () => {
  it("orders active categories by product group and reports dependencies", async () => {
    const data = await getHouseholdCategoryMaintenanceData(ids.householdA);
    expect(data.sections).toEqual(["Needs", "Flex", "Savings", "Debt"]);
    expect(data.activeChoices.map((category) => category.section)).toEqual([
      "Needs",
      "Flex",
      "Flex",
      "Flex",
      "Savings",
      "Savings",
      "Savings"
    ]);
    expect(
      data.categories.find((category) => category.id === ids.flex)?.dependencies
    ).toEqual({ transactions: 1, rules: 1, allocations: 1 });
  });

  it("creates, renames, moves, reorders, and rejects duplicate or stale writes", async () => {
    let data = await getHouseholdCategoryMaintenanceData(ids.householdA);
    const duplicate = await maintainCategoryAction(
      {},
      form({
        intent: "create",
        name: "  FOOD ",
        section: "Needs",
        expectedListRevision: data.listRevision
      })
    );
    expect(duplicate).toMatchObject({ code: "DUPLICATE" });

    const originalNeeds = data.categories.find(
      (category) => category.id === ids.needs
    )!;
    const renamed = await categoryMutation("rename", ids.needs, {
      name: "Utilities"
    });
    expect(renamed.success).toContain("Utilities was renamed");

    const stale = await maintainCategoryAction(
      {},
      form({
        intent: "rename",
        categoryId: ids.needs,
        name: "Stale overwrite",
        expectedListRevision: data.listRevision,
        expectedCategoryRevision: originalNeeds.revision
      })
    );
    expect(stale).toMatchObject({ code: "CONFLICT" });

    expect(
      (
        await categoryMutation("move", ids.needs, {
          section: "Flex"
        })
      ).success
    ).toBe("Category moved to Flex.");
    expect(
      (
        await categoryMutation("reorder", ids.needs, {
          direction: "up"
        })
      ).success
    ).toBe("Category moved up.");
    data = await getHouseholdCategoryMaintenanceData(ids.householdA);
    const flex = data.activeChoices.filter(
      (category) => category.section === "Flex"
    );
    expect(flex.map((category) => category.id)).toContain(ids.needs);
    expect(flex.map((category) => category.sortOrder)).toEqual(
      flex.map((_, index) => index)
    );
  });

  it("archives and restores without rewriting transaction, rule, or budget history", async () => {
    const transactionBefore = await prisma.transaction.findUniqueOrThrow({
      where: { id: ids.transaction }
    });
    const allocationBefore = await prisma.budgetAllocation.findFirstOrThrow({
      where: { budgetMonthId: ids.month, categoryId: ids.flex }
    });
    expect((await categoryMutation("archive", ids.flex)).success).toContain(
      "Transactions and existing budget allocations were preserved"
    );
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: ids.transaction } })
    ).resolves.toEqual(transactionBefore);
    await expect(
      prisma.budgetAllocation.findUniqueOrThrow({
        where: { id: allocationBefore.id }
      })
    ).resolves.toEqual(allocationBefore);
    await expect(
      prisma.merchantRule.findUniqueOrThrow({
        where: { id: `${key}-flex-rule` }
      })
    ).resolves.toMatchObject({ categoryId: ids.flex });
    const review = await getHouseholdCategoryReviewData(ids.householdA);
    expect(review.categories.map((category) => category.id)).not.toContain(
      ids.flex
    );
    expect(review.rules.map((rule) => rule.id)).not.toContain(
      `${key}-flex-rule`
    );

    expect((await categoryMutation("restore", ids.flex)).success).toContain(
      "preserved merchant rules are active again"
    );
    const restoredReview = await getHouseholdCategoryReviewData(ids.householdA);
    expect(restoredReview.categories.map((category) => category.id)).toContain(
      ids.flex
    );
    expect(restoredReview.rules.map((rule) => rule.id)).toContain(
      `${key}-flex-rule`
    );
  });

  it("merges dependencies transactionally with exact allocation arithmetic", async () => {
    const data = await getHouseholdCategoryMaintenanceData(ids.householdA);
    const target = data.categories.find(
      (category) => category.id === ids.mergeTarget
    )!;
    const result = await categoryMutation("merge", ids.mergeSource, {
      targetCategoryId: ids.mergeTarget,
      expectedTargetRevision: target.revision
    });
    expect(result.success).toContain(
      "Migrated 1 transactions, 1 rules, and 1 budget allocations"
    );
    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { id: ids.mergeTransaction }
      })
    ).resolves.toMatchObject({
      categoryId: ids.mergeTarget,
      plaidTransactionId: `${key}-plaid-merge`,
      amount: new Prisma.Decimal("5.00")
    });
    await expect(
      prisma.merchantRule.findUniqueOrThrow({
        where: { id: `${key}-merge-rule` }
      })
    ).resolves.toMatchObject({ categoryId: ids.mergeTarget });
    const allocations = await prisma.budgetAllocation.findMany({
      where: {
        budgetMonthId: ids.month,
        categoryId: { in: [ids.mergeSource, ids.mergeTarget] }
      }
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0].categoryId).toBe(ids.mergeTarget);
    expect(allocations[0].planned.toFixed(2)).toBe("50.30");
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: ids.mergeSource } })
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
  });

  it("blocks ambiguous budget destination merges without partial migration", async () => {
    const data = await getHouseholdCategoryMaintenanceData(ids.householdA);
    const source = data.categories.find(
      (category) => category.id === ids.conflictSource
    )!;
    const target = data.categories.find(
      (category) => category.id === ids.conflictTarget
    )!;
    const result = await maintainCategoryAction(
      {},
      form({
        intent: "merge",
        categoryId: source.id,
        targetCategoryId: target.id,
        expectedListRevision: data.listRevision,
        expectedCategoryRevision: source.revision,
        expectedTargetRevision: target.revision
      })
    );
    expect(result).toMatchObject({ code: "DESTINATION_CONFLICT" });
    expect(
      await prisma.budgetAllocation.count({
        where: {
          budgetMonthId: ids.month,
          categoryId: { in: [ids.conflictSource, ids.conflictTarget] }
        }
      })
    ).toBe(2);
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: ids.conflictSource } })
    ).resolves.toMatchObject({ archivedAt: null });
  });

  it("normalizes, edits, rejects conflicts, and deletes explicit merchant rules", async () => {
    let result = await maintainCategoryAction(
      {},
      form({
        intent: "createRule",
        merchantKey: "  CAFÉ\u00a0 MARKET ",
        targetCategoryId: ids.needs
      })
    );
    expect(result.success).toContain("“café market”");
    let rule = await prisma.merchantRule.findUniqueOrThrow({
      where: {
        householdId_merchantKey: {
          householdId: ids.householdA,
          merchantKey: "café market"
        }
      }
    });

    result = await maintainCategoryAction(
      {},
      form({
        intent: "updateRule",
        ruleId: rule.id,
        merchantKey: "  Café   Market #2 ",
        targetCategoryId: ids.savings,
        expectedRuleRevision: rule.updatedAt.toISOString()
      })
    );
    expect(result.success).toContain("“café market #2”");
    rule = await prisma.merchantRule.findUniqueOrThrow({
      where: { id: rule.id }
    });
    expect(rule).toMatchObject({
      merchantKey: "café market #2",
      categoryId: ids.savings
    });

    const duplicate = await maintainCategoryAction(
      {},
      form({
        intent: "updateRule",
        ruleId: rule.id,
        merchantKey: "dining history",
        targetCategoryId: ids.savings,
        expectedRuleRevision: rule.updatedAt.toISOString()
      })
    );
    expect(duplicate).toMatchObject({ code: "DUPLICATE" });

    const staleRevision = rule.updatedAt.toISOString();
    await prisma.merchantRule.update({
      where: { id: rule.id },
      data: { categoryId: ids.needs }
    });
    const stale = await maintainCategoryAction(
      {},
      form({
        intent: "deleteRule",
        ruleId: rule.id,
        expectedRuleRevision: staleRevision
      })
    );
    expect(stale).toMatchObject({ code: "CONFLICT" });
    rule = await prisma.merchantRule.findUniqueOrThrow({
      where: { id: rule.id }
    });
    const deleted = await maintainCategoryAction(
      {},
      form({
        intent: "deleteRule",
        ruleId: rule.id,
        expectedRuleRevision: rule.updatedAt.toISOString()
      })
    );
    expect(deleted.success).toContain("was deleted");
  });

  it("does not mutate a foreign household category", async () => {
    const before = await prisma.category.findUniqueOrThrow({
      where: { id: ids.foreign }
    });
    const result = await categoryMutation("rename", ids.foreign, {
      name: "Stolen"
    });
    expect(result).toMatchObject({ code: "NOT_FOUND" });
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: ids.foreign } })
    ).resolves.toEqual(before);

    const foreignRule = await prisma.merchantRule.findUniqueOrThrow({
      where: { id: `${key}-foreign-rule` }
    });
    const ruleResult = await maintainCategoryAction(
      {},
      form({
        intent: "updateRule",
        ruleId: foreignRule.id,
        merchantKey: "stolen merchant",
        targetCategoryId: ids.needs,
        expectedRuleRevision: foreignRule.updatedAt.toISOString()
      })
    );
    expect(ruleResult).toMatchObject({ code: "NOT_FOUND" });
    await expect(
      prisma.merchantRule.findUniqueOrThrow({ where: { id: foreignRule.id } })
    ).resolves.toEqual(foreignRule);
  });
});
