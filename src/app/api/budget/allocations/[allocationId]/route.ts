import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeBudgetAmount } from "@/features/budget/budget-domain";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const allocationRequest = z.object({
  planned: z.string(),
  destinationAccountId: z.string().min(1).nullable(),
  expectedUpdatedAt: z.string().refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
  })
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ allocationId: string }> }
) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = allocationRequest.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted allocation fields.",
        fieldErrors: {
          planned: "Enter a USD amount from 0 to 10,000,000."
        }
      },
      { status: 400 }
    );
  }
  const planned = normalizeBudgetAmount(parsed.data.planned);
  if (!planned) {
    return NextResponse.json(
      {
        error: "Check the highlighted allocation fields.",
        fieldErrors: {
          planned:
            "Enter a USD amount from 0 to 10,000,000 with no more than two decimal places."
        }
      },
      { status: 400 }
    );
  }
  const { allocationId } = await params;
  const allocation = await prisma.budgetAllocation.findFirst({
    where: {
      id: allocationId,
      budgetMonth: { householdId: owner.householdId }
    },
    select: {
      id: true,
      budgetMonthId: true,
      updatedAt: true
    }
  });
  if (!allocation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (allocation.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
    return NextResponse.json(
      {
        error:
          "This allocation changed in another session. Reload the budget before saving again.",
        code: "BUDGET_EDIT_CONFLICT"
      },
      { status: 409 }
    );
  }
  if (parsed.data.destinationAccountId) {
    const account = await prisma.financialAccount.findFirst({
      where: {
        id: parsed.data.destinationAccountId,
        householdId: owner.householdId
      },
      select: {
        id: true,
        isActive: true,
        archivedAt: true,
        isoCurrencyCode: true
      }
    });
    if (!account) {
      return NextResponse.json(
        { error: "Destination account not found" },
        { status: 404 }
      );
    }
    if (
      !account.isActive ||
      account.archivedAt !== null ||
      account.isoCurrencyCode !== "USD"
    ) {
      return NextResponse.json(
        {
          error:
            "Choose an active USD destination account from this household.",
          fieldErrors: {
            destinationAccountId:
              "Choose an active USD destination account from this household."
          }
        },
        { status: 422 }
      );
    }
  }
  const result = await prisma.$transaction(async (tx) => {
    const update = await tx.budgetAllocation.updateMany({
      where: {
        id: allocation.id,
        budgetMonthId: allocation.budgetMonthId,
        updatedAt: allocation.updatedAt
      },
      data: {
        planned,
        destinationAccountId: parsed.data.destinationAccountId
      }
    });
    if (update.count !== 1) return null;
    const updated = await tx.budgetAllocation.findUniqueOrThrow({
      where: { id: allocation.id },
      select: { updatedAt: true }
    });
    const reuseCount = parsed.data.destinationAccountId
      ? await tx.budgetAllocation.count({
          where: {
            budgetMonthId: allocation.budgetMonthId,
            destinationAccountId: parsed.data.destinationAccountId,
            id: { not: allocation.id },
            budgetMonth: { householdId: owner.householdId }
          }
        })
      : 0;
    return { updatedAt: updated.updatedAt, reuseCount };
  });
  if (!result) {
    return NextResponse.json(
      {
        error:
          "This allocation changed in another session. Reload the budget before saving again.",
        code: "BUDGET_EDIT_CONFLICT"
      },
      { status: 409 }
    );
  }
  return NextResponse.json({
    updated: true,
    planned,
    revision: result.updatedAt.toISOString(),
    warning:
      result.reuseCount > 0
        ? "This destination is also used by another allocation. Its matched transfer total is shared once in budget order."
        : null
  });
}
