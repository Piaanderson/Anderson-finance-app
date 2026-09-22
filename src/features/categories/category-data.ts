import "server-only";
import { prisma } from "@/server/db";
import {
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
  category: {
    id: string;
    name: string;
  };
};

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
    rules: ruleRows satisfies MerchantRuleReview[]
  };
}
