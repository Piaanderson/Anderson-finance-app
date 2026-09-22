import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  budgetMonthKey,
  parseBudgetMonthKey,
  shiftBudgetMonth
} from "@/features/budget/budget-domain";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const copyRequest = z.object({
  sourceMonth: z.string(),
  targetMonth: z.string()
});

export async function POST(request: Request) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = copyRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid budget months" },
      { status: 400 }
    );
  }

  const sourceMonth = parseBudgetMonthKey(parsed.data.sourceMonth);
  const targetMonth = parseBudgetMonthKey(parsed.data.targetMonth);
  if (
    !sourceMonth ||
    !targetMonth ||
    budgetMonthKey(shiftBudgetMonth(sourceMonth, 1)) !==
      budgetMonthKey(targetMonth)
  ) {
    return NextResponse.json(
      { error: "Choose a target immediately after the source month" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const source = await tx.budgetMonth.findUnique({
          where: {
            householdId_month: {
              householdId: owner.householdId,
              month: sourceMonth
            }
          },
          include: {
            allocations: {
              include: {
                category: {
                  select: { householdId: true, archivedAt: true }
                },
                destinationAccount: {
                  select: {
                    householdId: true,
                    archivedAt: true,
                    isActive: true
                  }
                }
              }
            }
          }
        });
        if (!source) return { kind: "NOT_FOUND" as const };

        const existing = await tx.budgetMonth.findUnique({
          where: {
            householdId_month: {
              householdId: owner.householdId,
              month: targetMonth
            }
          },
          select: { id: true }
        });
        if (existing) return { kind: "EXISTS" as const };

        const allocations = source.allocations
          .filter(
            (allocation) =>
              allocation.category.householdId === owner.householdId &&
              allocation.category.archivedAt === null
          )
          .map((allocation) => ({
            categoryId: allocation.categoryId,
            planned: allocation.planned,
            destinationAccountId:
              allocation.destinationAccount?.householdId ===
                owner.householdId &&
              allocation.destinationAccount.archivedAt === null &&
              allocation.destinationAccount.isActive
                ? allocation.destinationAccountId
                : null
          }));

        const created = await tx.budgetMonth.create({
          data: {
            householdId: owner.householdId,
            month: targetMonth,
            income: source.income,
            allocations: { create: allocations }
          },
          select: { id: true }
        });
        return {
          kind: "CREATED" as const,
          id: created.id,
          allocationsCopied: allocations.length
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );

    if (result.kind === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Previous budget month not found" },
        { status: 404 }
      );
    }
    if (result.kind === "EXISTS") {
      return NextResponse.json(
        { error: "The target budget month already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        id: result.id,
        month: budgetMonthKey(targetMonth),
        allocationsCopied: result.allocationsCopied
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        { error: "The target budget month already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
