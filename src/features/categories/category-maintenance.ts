import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  categoryListRevision,
  type CategoryMaintenanceCategory
} from "./category-data";
import {
  categoryNameKey,
  categorySectionOrder,
  isCategorySection,
  normalizeCategoryName,
  type CategorySection
} from "./category-domain";
import { normalizeMerchantRuleKey } from "./merchant-rule";

export class CategoryMaintenanceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFLICT"
      | "DESTINATION_CONFLICT"
      | "DUPLICATE"
      | "NOT_FOUND"
      | "VALIDATION"
  ) {
    super(message);
  }
}

type CategoryMutationRevision = {
  expectedListRevision: string;
  expectedCategoryRevision?: string;
};

type CategoryRow = {
  id: string;
  name: string;
  section: string;
  sortOrder: number;
  archivedAt: Date | null;
  updatedAt: Date;
};

function conflict() {
  return new CategoryMaintenanceError(
    "Categories changed in another session. Reload this page before saving again.",
    "CONFLICT"
  );
}

function validActiveRows(rows: CategoryRow[]) {
  return rows
    .filter(
      (
        row
      ): row is CategoryRow & {
        section: CategorySection;
      } => row.archivedAt === null && isCategorySection(row.section)
    )
    .sort(
      (left, right) =>
        categorySectionOrder(left.section) -
          categorySectionOrder(right.section) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
    );
}

function requireCategory(
  rows: CategoryRow[],
  id: string,
  expectedRevision?: string
) {
  const category = rows.find((row) => row.id === id);
  if (!category || !isCategorySection(category.section)) {
    throw new CategoryMaintenanceError("Category not found.", "NOT_FOUND");
  }
  if (
    expectedRevision &&
    category.updatedAt.toISOString() !== expectedRevision
  ) {
    throw conflict();
  }
  return category as CategoryRow & { section: CategorySection };
}

function assertRevisions(
  rows: CategoryRow[],
  revision: CategoryMutationRevision
) {
  if (categoryListRevision(rows) !== revision.expectedListRevision) {
    throw conflict();
  }
}

function normalizedName(value: string) {
  const name = normalizeCategoryName(value);
  if (name.length < 2 || name.length > 60) {
    throw new CategoryMaintenanceError(
      "Use a category name from 2 to 60 characters.",
      "VALIDATION"
    );
  }
  return name;
}

function assertUniqueName(
  rows: CategoryRow[],
  name: string,
  exceptId?: string
) {
  const key = categoryNameKey(name);
  const duplicate = rows.find(
    (row) => row.id !== exceptId && categoryNameKey(row.name) === key
  );
  if (duplicate) {
    throw new CategoryMaintenanceError(
      duplicate.archivedAt
        ? "An archived category already uses that name. Restore or rename it instead."
        : "A category already uses that name.",
      "DUPLICATE"
    );
  }
}

async function readCategoryRows(
  tx: Prisma.TransactionClient,
  householdId: string
) {
  return tx.category.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      section: true,
      sortOrder: true,
      archivedAt: true,
      updatedAt: true
    }
  });
}

async function writeOrdering(
  tx: Prisma.TransactionClient,
  householdId: string,
  ordered: Array<CategoryRow & { section: CategorySection }>
) {
  const bySection = new Map<CategorySection, typeof ordered>();
  for (const row of ordered) {
    const sectionRows = bySection.get(row.section) ?? [];
    sectionRows.push(row);
    bySection.set(row.section, sectionRows);
  }
  for (const [section, rows] of bySection) {
    for (const [sortOrder, row] of rows.entries()) {
      await tx.category.updateMany({
        where: { id: row.id, householdId, archivedAt: null },
        data: { section, sortOrder }
      });
    }
  }
}

async function serializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      ) {
        if (error.code === "P2002") {
          throw new CategoryMaintenanceError(
            "A category or merchant rule already uses that value.",
            "DUPLICATE"
          );
        }
        throw conflict();
      }
      throw error;
    }
  }
  throw conflict();
}

export async function createHouseholdCategory(
  householdId: string,
  input: {
    name: string;
    section: CategorySection;
    expectedListRevision: string;
  }
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const name = normalizedName(input.name);
    assertUniqueName(rows, name);
    const sectionRows = validActiveRows(rows).filter(
      (row) => row.section === input.section
    );
    return tx.category.create({
      data: {
        householdId,
        name,
        section: input.section,
        sortOrder: sectionRows.length
      }
    });
  });
}

export async function renameHouseholdCategory(
  householdId: string,
  input: {
    categoryId: string;
    name: string;
  } & CategoryMutationRevision
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const category = requireCategory(
      rows,
      input.categoryId,
      input.expectedCategoryRevision
    );
    const name = normalizedName(input.name);
    assertUniqueName(rows, name, category.id);
    const updated = await tx.category.updateMany({
      where: {
        id: category.id,
        householdId,
        updatedAt: category.updatedAt
      },
      data: { name }
    });
    if (updated.count !== 1) throw conflict();
    return name;
  });
}

export async function reorderHouseholdCategory(
  householdId: string,
  input: {
    categoryId: string;
    direction: "up" | "down";
  } & CategoryMutationRevision
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const category = requireCategory(
      rows,
      input.categoryId,
      input.expectedCategoryRevision
    );
    if (category.archivedAt) {
      throw new CategoryMaintenanceError(
        "Restore this category before reordering it.",
        "VALIDATION"
      );
    }
    const ordered = validActiveRows(rows);
    const sectionRows = ordered.filter(
      (row) => row.section === category.section
    );
    const index = sectionRows.findIndex((row) => row.id === category.id);
    const nextIndex = input.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= sectionRows.length) {
      throw new CategoryMaintenanceError(
        "This category is already at the edge of its group.",
        "VALIDATION"
      );
    }
    [sectionRows[index], sectionRows[nextIndex]] = [
      sectionRows[nextIndex],
      sectionRows[index]
    ];
    const nextOrder = ordered.filter((row) => row.section !== category.section);
    nextOrder.push(...sectionRows);
    await writeOrdering(tx, householdId, nextOrder);
  });
}

export async function moveHouseholdCategory(
  householdId: string,
  input: {
    categoryId: string;
    section: CategorySection;
  } & CategoryMutationRevision
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const category = requireCategory(
      rows,
      input.categoryId,
      input.expectedCategoryRevision
    );
    if (category.archivedAt) {
      throw new CategoryMaintenanceError(
        "Restore this category before moving it.",
        "VALIDATION"
      );
    }
    if (category.section === input.section) {
      throw new CategoryMaintenanceError(
        "Choose a different category group.",
        "VALIDATION"
      );
    }
    const ordered = validActiveRows(rows)
      .filter((row) => row.id !== category.id)
      .map((row) => ({ ...row }));
    ordered.push({ ...category, section: input.section });
    await writeOrdering(tx, householdId, ordered);
  });
}

export async function archiveHouseholdCategory(
  householdId: string,
  input: { categoryId: string } & CategoryMutationRevision
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const category = requireCategory(
      rows,
      input.categoryId,
      input.expectedCategoryRevision
    );
    if (category.archivedAt) {
      throw new CategoryMaintenanceError(
        "This category is already archived.",
        "VALIDATION"
      );
    }
    const updated = await tx.category.updateMany({
      where: {
        id: category.id,
        householdId,
        archivedAt: null,
        updatedAt: category.updatedAt
      },
      data: { archivedAt: new Date() }
    });
    if (updated.count !== 1) throw conflict();
    await writeOrdering(
      tx,
      householdId,
      validActiveRows(rows).filter((row) => row.id !== category.id)
    );
  });
}

export async function restoreHouseholdCategory(
  householdId: string,
  input: { categoryId: string } & CategoryMutationRevision
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const category = requireCategory(
      rows,
      input.categoryId,
      input.expectedCategoryRevision
    );
    if (!category.archivedAt) {
      throw new CategoryMaintenanceError(
        "This category is already active.",
        "VALIDATION"
      );
    }
    assertUniqueName(rows, category.name, category.id);
    const end = validActiveRows(rows).filter(
      (row) => row.section === category.section
    ).length;
    const updated = await tx.category.updateMany({
      where: {
        id: category.id,
        householdId,
        archivedAt: category.archivedAt,
        updatedAt: category.updatedAt
      },
      data: { archivedAt: null, sortOrder: end }
    });
    if (updated.count !== 1) throw conflict();
  });
}

export async function mergeHouseholdCategory(
  householdId: string,
  input: {
    sourceCategoryId: string;
    targetCategoryId: string;
    expectedTargetRevision: string;
  } & CategoryMutationRevision
) {
  return serializable(async (tx) => {
    const rows = await readCategoryRows(tx, householdId);
    assertRevisions(rows, input);
    const source = requireCategory(
      rows,
      input.sourceCategoryId,
      input.expectedCategoryRevision
    );
    const target = requireCategory(
      rows,
      input.targetCategoryId,
      input.expectedTargetRevision
    );
    if (source.id === target.id || source.archivedAt || target.archivedAt) {
      throw new CategoryMaintenanceError(
        "Choose a different active category to merge into.",
        "VALIDATION"
      );
    }

    const sourceAllocations = await tx.budgetAllocation.findMany({
      where: {
        categoryId: source.id,
        budgetMonth: { householdId }
      },
      select: {
        id: true,
        budgetMonthId: true,
        planned: true,
        destinationAccountId: true
      }
    });
    const targetAllocations = await tx.budgetAllocation.findMany({
      where: {
        categoryId: target.id,
        budgetMonth: { householdId }
      },
      select: {
        id: true,
        budgetMonthId: true,
        planned: true,
        destinationAccountId: true
      }
    });
    const targetByMonth = new Map(
      targetAllocations.map((allocation) => [
        allocation.budgetMonthId,
        allocation
      ])
    );
    const destinationConflict = sourceAllocations.find((sourceAllocation) => {
      const targetAllocation = targetByMonth.get(
        sourceAllocation.budgetMonthId
      );
      return (
        targetAllocation?.destinationAccountId &&
        sourceAllocation.destinationAccountId &&
        targetAllocation.destinationAccountId !==
          sourceAllocation.destinationAccountId
      );
    });
    if (destinationConflict) {
      throw new CategoryMaintenanceError(
        "Merge blocked: both categories use different destination accounts in the same budget month. Resolve those destinations first.",
        "DESTINATION_CONFLICT"
      );
    }

    const transactionCount = await tx.transaction.count({
      where: { householdId, categoryId: source.id }
    });
    const ruleCount = await tx.merchantRule.count({
      where: { householdId, categoryId: source.id }
    });
    for (const sourceAllocation of sourceAllocations) {
      const targetAllocation = targetByMonth.get(
        sourceAllocation.budgetMonthId
      );
      if (!targetAllocation) {
        await tx.budgetAllocation.update({
          where: { id: sourceAllocation.id },
          data: { categoryId: target.id }
        });
        continue;
      }
      await tx.budgetAllocation.update({
        where: { id: targetAllocation.id },
        data: {
          planned: targetAllocation.planned.add(sourceAllocation.planned),
          destinationAccountId:
            targetAllocation.destinationAccountId ??
            sourceAllocation.destinationAccountId
        }
      });
      await tx.budgetAllocation.delete({
        where: { id: sourceAllocation.id }
      });
    }
    await tx.transaction.updateMany({
      where: { householdId, categoryId: source.id },
      data: { categoryId: target.id }
    });
    await tx.merchantRule.updateMany({
      where: { householdId, categoryId: source.id },
      data: { categoryId: target.id }
    });
    const now = new Date();
    const sourceUpdate = await tx.category.updateMany({
      where: {
        id: source.id,
        householdId,
        archivedAt: null,
        updatedAt: source.updatedAt
      },
      data: { archivedAt: now }
    });
    const targetUpdate = await tx.category.updateMany({
      where: {
        id: target.id,
        householdId,
        archivedAt: null,
        updatedAt: target.updatedAt
      },
      data: { updatedAt: now }
    });
    if (sourceUpdate.count !== 1 || targetUpdate.count !== 1) throw conflict();
    await writeOrdering(
      tx,
      householdId,
      validActiveRows(rows).filter((row) => row.id !== source.id)
    );
    return {
      sourceName: source.name,
      targetName: target.name,
      transactionsMoved: transactionCount,
      rulesMoved: ruleCount,
      allocationsMoved: sourceAllocations.length
    };
  });
}

function ruleKey(value: string) {
  const key = normalizeMerchantRuleKey(value);
  if (!key || key.length > 120) {
    throw new CategoryMaintenanceError(
      "Enter an exact merchant key from 1 to 120 characters.",
      "VALIDATION"
    );
  }
  return key;
}

async function requireActiveTarget(
  tx: Prisma.TransactionClient,
  householdId: string,
  categoryId: string
) {
  const category = await tx.category.findFirst({
    where: {
      id: categoryId,
      householdId,
      archivedAt: null
    },
    select: { id: true, section: true }
  });
  if (!category || !isCategorySection(category.section)) {
    throw new CategoryMaintenanceError(
      "Choose an active category from this household.",
      "NOT_FOUND"
    );
  }
  return category;
}

export async function createHouseholdMerchantRule(
  householdId: string,
  input: { merchantKey: string; categoryId: string }
) {
  return serializable(async (tx) => {
    await requireActiveTarget(tx, householdId, input.categoryId);
    const merchantKey = ruleKey(input.merchantKey);
    const duplicate = await tx.merchantRule.findUnique({
      where: { householdId_merchantKey: { householdId, merchantKey } },
      select: { id: true }
    });
    if (duplicate) {
      throw new CategoryMaintenanceError(
        "A merchant rule already uses that exact normalized key.",
        "DUPLICATE"
      );
    }
    return tx.merchantRule.create({
      data: { householdId, categoryId: input.categoryId, merchantKey }
    });
  });
}

export async function updateHouseholdMerchantRule(
  householdId: string,
  input: {
    ruleId: string;
    merchantKey: string;
    categoryId: string;
    expectedRuleRevision: string;
  }
) {
  return serializable(async (tx) => {
    await requireActiveTarget(tx, householdId, input.categoryId);
    const rule = await tx.merchantRule.findFirst({
      where: { id: input.ruleId, householdId },
      select: { id: true, updatedAt: true }
    });
    if (!rule) {
      throw new CategoryMaintenanceError(
        "Merchant rule not found.",
        "NOT_FOUND"
      );
    }
    if (rule.updatedAt.toISOString() !== input.expectedRuleRevision) {
      throw new CategoryMaintenanceError(
        "This merchant rule changed in another session. Reload before saving again.",
        "CONFLICT"
      );
    }
    const merchantKey = ruleKey(input.merchantKey);
    const duplicate = await tx.merchantRule.findFirst({
      where: {
        householdId,
        merchantKey,
        id: { not: rule.id }
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new CategoryMaintenanceError(
        "A merchant rule already uses that exact normalized key.",
        "DUPLICATE"
      );
    }
    const updated = await tx.merchantRule.updateMany({
      where: {
        id: rule.id,
        householdId,
        updatedAt: rule.updatedAt
      },
      data: { merchantKey, categoryId: input.categoryId }
    });
    if (updated.count !== 1) throw conflict();
    return merchantKey;
  });
}

export async function deleteHouseholdMerchantRule(
  householdId: string,
  input: { ruleId: string; expectedRuleRevision: string }
) {
  return serializable(async (tx) => {
    const rule = await tx.merchantRule.findFirst({
      where: { id: input.ruleId, householdId },
      select: { id: true, merchantKey: true, updatedAt: true }
    });
    if (!rule) {
      throw new CategoryMaintenanceError(
        "Merchant rule not found.",
        "NOT_FOUND"
      );
    }
    if (rule.updatedAt.toISOString() !== input.expectedRuleRevision) {
      throw new CategoryMaintenanceError(
        "This merchant rule changed in another session. Reload before deleting it.",
        "CONFLICT"
      );
    }
    const deleted = await tx.merchantRule.deleteMany({
      where: {
        id: rule.id,
        householdId,
        updatedAt: rule.updatedAt
      }
    });
    if (deleted.count !== 1) throw conflict();
    return rule.merchantKey;
  });
}

export function dependencySummary(category: CategoryMaintenanceCategory) {
  const { transactions, rules, allocations } = category.dependencies;
  return `${transactions} transaction${transactions === 1 ? "" : "s"}, ${rules} merchant rule${rules === 1 ? "" : "s"}, and ${allocations} budget allocation${allocations === 1 ? "" : "s"}`;
}
