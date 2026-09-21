"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHousehold } from "@/server/households";
import {
  archiveManualAccount,
  createManualAccount,
  linkPropertyDebt,
  ManualAccountError,
  manualClassifications,
  unlinkPropertyDebt,
  updateManualAccount
} from "./manual-accounts";

export type ManualAccountFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

const amount = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce
    .number({ error: "Enter a balance." })
    .finite("Enter a valid balance.")
);

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));

function currencyIsSupported(value: string) {
  return supportedCurrencies.has(value);
}

const accountInput = z
  .object({
    accountId: z.string().min(1).optional(),
    name: z
      .string()
      .trim()
      .min(2, "Enter at least two characters.")
      .max(80, "Use 80 characters or fewer."),
    classification: z.enum(manualClassifications, {
      error: "Choose an account type."
    }),
    entryBalance: amount,
    isoCurrencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a three-letter currency code.")
      .refine(currencyIsSupported, "Use a recognized ISO currency code."),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid effective date.")
  })
  .superRefine((value, context) => {
    if (value.classification === "DEBT" && value.entryBalance < 0) {
      context.addIssue({
        code: "custom",
        path: ["entryBalance"],
        message: "Enter the amount owed as a positive number."
      });
    }
    const effectiveAt = new Date(`${value.effectiveDate}T12:00:00.000Z`);
    if (
      Number.isNaN(effectiveAt.getTime()) ||
      effectiveAt.toISOString().slice(0, 10) !== value.effectiveDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveDate"],
        message: "Choose a valid effective date."
      });
    } else if (effectiveAt.getTime() > Date.now() + 12 * 60 * 60 * 1000) {
      context.addIssue({
        code: "custom",
        path: ["effectiveDate"],
        message: "The effective date cannot be in the future."
      });
    }
  });

function parseAccountForm(formData: FormData) {
  return accountInput.safeParse({
    accountId: formData.get("accountId") || undefined,
    name: formData.get("name"),
    classification: formData.get("classification"),
    entryBalance: formData.get("entryBalance"),
    isoCurrencyCode: formData.get("isoCurrencyCode"),
    effectiveDate: formData.get("effectiveDate")
  });
}

function validationState(
  result: Extract<ReturnType<typeof parseAccountForm>, { success: false }>
): ManualAccountFormState {
  const flattened = result.error.flatten();
  return {
    error: "Check the highlighted fields.",
    fieldErrors: Object.fromEntries(
      Object.entries(flattened.fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([field, messages]) => [field, messages[0]])
    )
  };
}

function refreshAccountReads() {
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function createManualAccountAction(
  _state: ManualAccountFormState,
  formData: FormData
): Promise<ManualAccountFormState> {
  const parsed = parseAccountForm(formData);
  if (!parsed.success) return validationState(parsed);
  const owner = await requireHousehold();
  await createManualAccount(owner.householdId, {
    name: parsed.data.name,
    classification: parsed.data.classification,
    entryBalance: parsed.data.entryBalance,
    isoCurrencyCode: parsed.data.isoCurrencyCode,
    effectiveAt: new Date(`${parsed.data.effectiveDate}T12:00:00.000Z`)
  });
  refreshAccountReads();
  return { success: `${parsed.data.name} was added.` };
}

export async function updateManualAccountAction(
  _state: ManualAccountFormState,
  formData: FormData
): Promise<ManualAccountFormState> {
  const parsed = parseAccountForm(formData);
  if (!parsed.success) return validationState(parsed);
  if (!parsed.data.accountId) return { error: "Manual account not found." };
  const owner = await requireHousehold();
  try {
    await updateManualAccount(owner.householdId, parsed.data.accountId, {
      name: parsed.data.name,
      classification: parsed.data.classification,
      entryBalance: parsed.data.entryBalance,
      isoCurrencyCode: parsed.data.isoCurrencyCode,
      effectiveAt: new Date(`${parsed.data.effectiveDate}T12:00:00.000Z`)
    });
    refreshAccountReads();
    return { success: `${parsed.data.name} was updated.` };
  } catch (error) {
    if (error instanceof ManualAccountError) return { error: error.message };
    throw error;
  }
}

export async function archiveManualAccountAction(
  _state: ManualAccountFormState,
  formData: FormData
): Promise<ManualAccountFormState> {
  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || !accountId) {
    return { error: "Manual account not found." };
  }
  const owner = await requireHousehold();
  try {
    await archiveManualAccount(owner.householdId, accountId);
    refreshAccountReads();
    return { success: "The account was archived. Its history was preserved." };
  } catch (error) {
    if (error instanceof ManualAccountError) return { error: error.message };
    throw error;
  }
}

export async function linkPropertyDebtAction(
  _state: ManualAccountFormState,
  formData: FormData
): Promise<ManualAccountFormState> {
  const propertyAccountId = formData.get("propertyAccountId");
  const debtAccountId = formData.get("debtAccountId");
  if (
    typeof propertyAccountId !== "string" ||
    !propertyAccountId ||
    typeof debtAccountId !== "string" ||
    !debtAccountId
  ) {
    return { error: "Choose a property and related debt." };
  }
  const owner = await requireHousehold();
  try {
    await linkPropertyDebt(owner.householdId, propertyAccountId, debtAccountId);
    refreshAccountReads();
    return { success: "Property and debt linked." };
  } catch (error) {
    if (error instanceof ManualAccountError) return { error: error.message };
    throw error;
  }
}

export async function unlinkPropertyDebtAction(
  _state: ManualAccountFormState,
  formData: FormData
): Promise<ManualAccountFormState> {
  const linkId = formData.get("linkId");
  if (typeof linkId !== "string" || !linkId) {
    return { error: "Property and debt link not found." };
  }
  const owner = await requireHousehold();
  try {
    await unlinkPropertyDebt(owner.householdId, linkId);
    refreshAccountReads();
    return { success: "Property and debt unlinked." };
  } catch (error) {
    if (error instanceof ManualAccountError) return { error: error.message };
    throw error;
  }
}
