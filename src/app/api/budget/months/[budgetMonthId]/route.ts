import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeBudgetAmount } from "@/features/budget/budget-domain";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const incomeRequest = z.object({
  income: z.string(),
  expectedUpdatedAt: z.string().refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
  })
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ budgetMonthId: string }> }
) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = incomeRequest.safeParse(
    await request.json().catch(() => null)
  );
  const income = parsed.success
    ? normalizeBudgetAmount(parsed.data.income)
    : null;
  if (!parsed.success || !income) {
    return NextResponse.json(
      {
        error: "Check the highlighted income field.",
        fieldErrors: {
          income:
            "Enter a USD amount from 0 to 10,000,000 with no more than two decimal places."
        }
      },
      { status: 400 }
    );
  }

  const { budgetMonthId } = await params;
  const budgetMonth = await prisma.budgetMonth.findFirst({
    where: { id: budgetMonthId, householdId: owner.householdId },
    select: { id: true, updatedAt: true }
  });
  if (!budgetMonth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (budgetMonth.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
    return NextResponse.json(
      {
        error:
          "This income plan changed in another session. Reload the budget before saving again.",
        code: "BUDGET_EDIT_CONFLICT"
      },
      { status: 409 }
    );
  }

  const update = await prisma.budgetMonth.updateMany({
    where: {
      id: budgetMonth.id,
      householdId: owner.householdId,
      updatedAt: budgetMonth.updatedAt
    },
    data: { income }
  });
  if (update.count !== 1) {
    return NextResponse.json(
      {
        error:
          "This income plan changed in another session. Reload the budget before saving again.",
        code: "BUDGET_EDIT_CONFLICT"
      },
      { status: 409 }
    );
  }
  const updated = await prisma.budgetMonth.findUniqueOrThrow({
    where: { id: budgetMonth.id },
    select: { updatedAt: true }
  });
  return NextResponse.json({
    updated: true,
    income,
    revision: updated.updatedAt.toISOString()
  });
}
