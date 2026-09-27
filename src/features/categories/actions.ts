"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHousehold } from "@/server/households";
import {
  archiveHouseholdCategory,
  CategoryMaintenanceError,
  createHouseholdCategory,
  createHouseholdMerchantRule,
  deleteHouseholdMerchantRule,
  mergeHouseholdCategory,
  moveHouseholdCategory,
  renameHouseholdCategory,
  reorderHouseholdCategory,
  restoreHouseholdCategory,
  updateHouseholdMerchantRule
} from "./category-maintenance";
import { categorySectionSchema } from "./category-domain";

export type CategoryFormState = {
  error?: string;
  success?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
};

const revision = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Reload before saving this category.");
const timestamp = z.string().datetime({
  offset: true,
  message: "Reload before saving this item."
});
const categoryId = z.string().min(1, "Category not found.");
const merchantRuleId = z.string().min(1, "Merchant rule not found.");
const categoryName = z
  .string()
  .trim()
  .min(2, "Enter at least two characters.")
  .max(60, "Use 60 characters or fewer.");
const merchantKey = z
  .string()
  .trim()
  .min(1, "Enter an exact merchant key.")
  .max(120, "Use 120 characters or fewer.");

const categoryMutation = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    name: categoryName,
    section: categorySectionSchema,
    expectedListRevision: revision
  }),
  z.object({
    intent: z.literal("rename"),
    categoryId,
    name: categoryName,
    expectedListRevision: revision,
    expectedCategoryRevision: timestamp
  }),
  z.object({
    intent: z.literal("reorder"),
    categoryId,
    direction: z.enum(["up", "down"]),
    expectedListRevision: revision,
    expectedCategoryRevision: timestamp
  }),
  z.object({
    intent: z.literal("move"),
    categoryId,
    section: categorySectionSchema,
    expectedListRevision: revision,
    expectedCategoryRevision: timestamp
  }),
  z.object({
    intent: z.literal("archive"),
    categoryId,
    expectedListRevision: revision,
    expectedCategoryRevision: timestamp
  }),
  z.object({
    intent: z.literal("restore"),
    categoryId,
    expectedListRevision: revision,
    expectedCategoryRevision: timestamp
  }),
  z.object({
    intent: z.literal("merge"),
    categoryId,
    targetCategoryId: categoryId,
    expectedListRevision: revision,
    expectedCategoryRevision: timestamp,
    expectedTargetRevision: timestamp
  }),
  z.object({
    intent: z.literal("createRule"),
    merchantKey,
    targetCategoryId: categoryId
  }),
  z.object({
    intent: z.literal("updateRule"),
    ruleId: merchantRuleId,
    merchantKey,
    targetCategoryId: categoryId,
    expectedRuleRevision: timestamp
  }),
  z.object({
    intent: z.literal("deleteRule"),
    ruleId: merchantRuleId,
    expectedRuleRevision: timestamp
  })
]);

function refreshCategoryReads() {
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/dashboard");
}

function validationState(
  result: Extract<
    ReturnType<typeof categoryMutation.safeParse>,
    { success: false }
  >
): CategoryFormState {
  const flattened = result.error.flatten();
  return {
    error: "Check the highlighted fields.",
    code: "VALIDATION",
    fieldErrors: Object.fromEntries(
      Object.entries(flattened.fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([field, messages]) => [field, messages[0]])
    )
  };
}

export async function maintainCategoryAction(
  _state: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const parsed = categoryMutation.safeParse({
    intent: formData.get("intent"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    section: formData.get("section"),
    direction: formData.get("direction"),
    targetCategoryId: formData.get("targetCategoryId"),
    ruleId: formData.get("ruleId"),
    merchantKey: formData.get("merchantKey"),
    expectedListRevision: formData.get("expectedListRevision"),
    expectedCategoryRevision: formData.get("expectedCategoryRevision"),
    expectedTargetRevision: formData.get("expectedTargetRevision"),
    expectedRuleRevision: formData.get("expectedRuleRevision")
  });
  if (!parsed.success) return validationState(parsed);

  const owner = await requireHousehold();
  try {
    const input = parsed.data;
    let success: string;
    switch (input.intent) {
      case "create": {
        const created = await createHouseholdCategory(owner.householdId, input);
        success = `${created.name} was added to ${created.section}.`;
        break;
      }
      case "rename": {
        const name = await renameHouseholdCategory(owner.householdId, input);
        success = `${name} was renamed. Historical links were preserved.`;
        break;
      }
      case "reorder":
        await reorderHouseholdCategory(owner.householdId, input);
        success = `Category moved ${input.direction}.`;
        break;
      case "move":
        await moveHouseholdCategory(owner.householdId, input);
        success = `Category moved to ${input.section}.`;
        break;
      case "archive":
        await archiveHouseholdCategory(owner.householdId, input);
        success =
          "Category archived. Transactions and existing budget allocations were preserved; its merchant rules are paused.";
        break;
      case "restore":
        await restoreHouseholdCategory(owner.householdId, input);
        success =
          "Category restored. Its preserved merchant rules are active again.";
        break;
      case "merge": {
        const result = await mergeHouseholdCategory(owner.householdId, {
          ...input,
          sourceCategoryId: input.categoryId
        });
        success = `${result.sourceName} was merged into ${result.targetName}. Migrated ${result.transactionsMoved} transactions, ${result.rulesMoved} rules, and ${result.allocationsMoved} budget allocations.`;
        break;
      }
      case "createRule": {
        const rule = await createHouseholdMerchantRule(owner.householdId, {
          merchantKey: input.merchantKey,
          categoryId: input.targetCategoryId
        });
        success = `Merchant rule “${rule.merchantKey}” was added.`;
        break;
      }
      case "updateRule": {
        const savedKey = await updateHouseholdMerchantRule(owner.householdId, {
          ruleId: input.ruleId,
          merchantKey: input.merchantKey,
          categoryId: input.targetCategoryId,
          expectedRuleRevision: input.expectedRuleRevision
        });
        success = `Merchant rule “${savedKey}” was updated.`;
        break;
      }
      case "deleteRule": {
        const deletedKey = await deleteHouseholdMerchantRule(
          owner.householdId,
          input
        );
        success = `Merchant rule “${deletedKey}” was deleted.`;
        break;
      }
    }
    refreshCategoryReads();
    return { success };
  } catch (error) {
    if (error instanceof CategoryMaintenanceError) {
      const intent = parsed.data.intent;
      let fieldErrors: Record<string, string> | undefined;
      if (
        error.code === "DUPLICATE" &&
        (intent === "create" || intent === "rename")
      ) {
        fieldErrors = { name: error.message };
      } else if (
        error.code === "DUPLICATE" &&
        (intent === "createRule" || intent === "updateRule")
      ) {
        fieldErrors = { merchantKey: error.message };
      } else if (error.code === "DESTINATION_CONFLICT" || intent === "merge") {
        fieldErrors = { targetCategoryId: error.message };
      } else if (error.code === "VALIDATION" && intent === "move") {
        fieldErrors = { section: error.message };
      }
      return {
        error: error.message,
        code: error.code,
        fieldErrors
      };
    }
    return {
      error:
        "The category update could not be saved. Check your connection and try again.",
      code: "PERSISTENCE_FAILURE"
    };
  }
}
