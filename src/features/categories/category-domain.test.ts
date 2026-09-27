import { describe, expect, it } from "vitest";
import {
  CATEGORY_SECTIONS,
  categoryNameKey,
  categorySectionOrder,
  categorySectionSchema,
  isCategorySection,
  normalizeCategoryName
} from "./category-domain";
import { merchantRuleKey, normalizeMerchantRuleKey } from "./merchant-rule";

describe("category domain", () => {
  it("keeps the approved budget sections in product order", () => {
    expect(CATEGORY_SECTIONS).toEqual(["Needs", "Flex", "Savings", "Debt"]);
    expect(CATEGORY_SECTIONS.map(categorySectionOrder)).toEqual([0, 1, 2, 3]);
  });

  it("rejects free-text sections outside the validated domain", () => {
    expect(categorySectionSchema.safeParse("Needs").success).toBe(true);
    expect(categorySectionSchema.safeParse("Other").success).toBe(false);
    expect(isCategorySection("Flex")).toBe(true);
    expect(isCategorySection("flex")).toBe(false);
  });

  it("normalizes display names and compares duplicate names consistently", () => {
    expect(normalizeCategoryName("  HOA\u00a0  + birthdays ")).toBe(
      "HOA + birthdays"
    );
    expect(categoryNameKey(" DINING ")).toBe(categoryNameKey("dining"));
  });
});

describe("merchant rule identity", () => {
  it("prefers merchant name and normalizes case, Unicode, and whitespace", () => {
    expect(
      merchantRuleKey({
        merchantName: "  CAFÉ\u00a0  MARKET ",
        name: "Fallback"
      })
    ).toBe("café market");
  });

  it("falls back deterministically to the Plaid transaction name", () => {
    expect(
      merchantRuleKey({
        merchantName: " ",
        name: "  COFFEE   SHOP 123 "
      })
    ).toBe("coffee shop 123");
  });

  it("normalizes user-edited exact rule keys with the same policy", () => {
    expect(normalizeMerchantRuleKey("  CAFÉ\u00a0  MARKET ")).toBe(
      "café market"
    );
    expect(normalizeMerchantRuleKey("   ")).toBe("");
  });
});
