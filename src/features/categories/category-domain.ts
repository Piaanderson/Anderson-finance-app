import { z } from "zod";

export const CATEGORY_SECTIONS = ["Needs", "Flex", "Savings", "Debt"] as const;
export const categorySectionSchema = z.enum(CATEGORY_SECTIONS);
export type CategorySection = z.infer<typeof categorySectionSchema>;

const sectionOrder = new Map(
  CATEGORY_SECTIONS.map((section, index) => [section, index])
);

export function isCategorySection(value: string): value is CategorySection {
  return categorySectionSchema.safeParse(value).success;
}

export function categorySectionOrder(section: CategorySection) {
  return sectionOrder.get(section) ?? CATEGORY_SECTIONS.length;
}

export function normalizeCategoryName(value: string) {
  return value.trim().normalize("NFKC").replace(/\s+/g, " ");
}

export function categoryNameKey(value: string) {
  return normalizeCategoryName(value).toLocaleLowerCase("en-US");
}
