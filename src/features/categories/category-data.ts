import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import {
  CATEGORY_SECTIONS,
  categorySectionOrder,
  isCategorySection,
  type CategorySection
} from "./category-domain";

export type CategoryReviewChoice = {
  id: string;
  name: string;
  section: CategorySection;
  sortOrder: number;
};

export type MerchantRuleReview = {
  id: string;
  merchantKey: string;
  revision: string;
  category: {
    id: string;
    name: string;
  };
};

export type CategoryMaintenanceCategory = CategoryReviewChoice & {
  archivedAt: string | null;
  revision: string;
  dependencies: {
    transactions: number;
    rules: number;
    allocations: number;
  };
};

export type MerchantRuleMaintenance = MerchantRuleReview & {
  category: MerchantRuleReview["category"] & {
    section: CategorySection;
    archived: boolean;
  };
};

type RevisionRow = {
  id: string;
  updatedAt: Date;
};

export function categoryListRevision(rows: RevisionRow[]) {
  return createHash("sha256")
    .update(
      [...rows]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => `${row.id}:${row.updatedAt.toISOString()}`)
        .join("|")
    )
    .digest("hex");
}

export async function getHouseholdCategoryReviewData(householdId: string) {
  const [categoryRows, ruleRows] = await Promise.all([
    prisma.category.findMany({
      where: { householdId, archivedAt: null },
      select: {
        id: true,
        name: true,
        section: true,
        sortOrder: true
      }
    }),
    prisma.merchantRule.findMany({
      where: {
        householdId,
        category: { householdId, archivedAt: null }
      },
      select: {
        id: true,
        merchantKey: true,
        updatedAt: true,
        category: { select: { id: true, name: true } }
      },
      orderBy: [{ merchantKey: "asc" }, { id: "asc" }]
    })
  ]);

  const categories: CategoryReviewChoice[] = categoryRows
    .filter(
      (category): category is typeof category & { section: CategorySection } =>
        isCategorySection(category.section)
    )
    .sort(
      (left, right) =>
        categorySectionOrder(left.section) -
          categorySectionOrder(right.section) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
    );

  return {
    categories,
    rules: ruleRows.map((rule) => ({
      id: rule.id,
      merchantKey: rule.merchantKey,
      revision: rule.updatedAt.toISOString(),
      category: rule.category
    })) satisfies MerchantRuleReview[]
  };
}

export async function getHouseholdCategoryMaintenanceData(householdId: string) {
  const [categoryRows, ruleRows] = await Promise.all([
    prisma.category.findMany({
      where: { householdId },
      select: {
        id: true,
        name: true,
        section: true,
        sortOrder: true,
        archivedAt: true,
        updatedAt: true,
        _count: {
          select: {
            transactions: true,
            rules: true,
            allocations: true
          }
        }
      }
    }),
    prisma.merchantRule.findMany({
      where: {
        householdId,
        category: { householdId }
      },
      select: {
        id: true,
        merchantKey: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            section: true,
            archivedAt: true
          }
        }
      },
      orderBy: [{ merchantKey: "asc" }, { id: "asc" }]
    })
  ]);

  const validCategories: CategoryMaintenanceCategory[] = categoryRows
    .filter(
      (category): category is typeof category & { section: CategorySection } =>
        isCategorySection(category.section)
    )
    .map((category) => ({
      id: category.id,
      name: category.name,
      section: category.section,
      sortOrder: category.sortOrder,
      archivedAt: category.archivedAt?.toISOString() ?? null,
      revision: category.updatedAt.toISOString(),
      dependencies: {
        transactions: category._count.transactions,
        rules: category._count.rules,
        allocations: category._count.allocations
      }
    }))
    .sort(
      (left, right) =>
        Number(left.archivedAt !== null) - Number(right.archivedAt !== null) ||
        categorySectionOrder(left.section) -
          categorySectionOrder(right.section) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
    );
  const categoryIds = new Set(validCategories.map((category) => category.id));
  const rules: MerchantRuleMaintenance[] = ruleRows
    .filter(
      (
        rule
      ): rule is typeof rule & {
        category: typeof rule.category & { section: CategorySection };
      } =>
        categoryIds.has(rule.category.id) &&
        isCategorySection(rule.category.section)
    )
    .map((rule) => ({
      id: rule.id,
      merchantKey: rule.merchantKey,
      revision: rule.updatedAt.toISOString(),
      category: {
        id: rule.category.id,
        name: rule.category.name,
        section: rule.category.section,
        archived: rule.category.archivedAt !== null
      }
    }));

  return {
    sections: CATEGORY_SECTIONS,
    categories: validCategories,
    activeChoices: validCategories.filter(
      (category) => category.archivedAt === null
    ),
    rules,
    listRevision: categoryListRevision(categoryRows),
    invalidLegacyCategoryCount: categoryRows.length - validCategories.length
  };
}
