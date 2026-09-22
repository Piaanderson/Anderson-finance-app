import { describe, expect, it } from "vitest";
import {
  CATEGORY_SECTIONS,
  categorySectionOrder,
  categorySectionSchema,
  isCategorySection
} from "./category-domain";
import { merchantRuleKey } from "./merchant-rule";

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
});
