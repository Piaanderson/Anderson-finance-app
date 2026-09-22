"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireHousehold } from "@/server/households";
import { categorySectionSchema } from "./category-domain";

export type CategoryFormState = {
  error?: string;
  success?: string;
};

const categoryInput = z.object({
  name: z.string().trim().min(2, "Enter at least two characters.").max(60),
  section: categorySectionSchema
});

export async function createCategory(
  _state: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const parsed = categoryInput.safeParse({
    name: formData.get("name"),
    section: formData.get("section")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the category." };
  }

  const owner = await requireHousehold();
  try {
    await prisma.category.create({
      data: {
        householdId: owner.householdId,
        name: parsed.data.name,
        section: parsed.data.section
      }
    });
    revalidatePath("/categories");
    return { success: `${parsed.data.name} was added.` };
  } catch {
    return { error: "That category already exists." };
  }
}
