import { NextResponse } from "next/server";
import { z } from "zod";
import { merchantRuleKey } from "@/features/categories/merchant-rule";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const categoryRequest = z.object({
  categoryId: z.string().min(1),
  createRule: z.boolean().default(false)
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = categoryRequest.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  const { transactionId } = await params;
  const [transaction, category] = await Promise.all([
    prisma.transaction.findFirst({
      where: {
        id: transactionId,
        householdId: owner.householdId,
        removedAt: null,
        account: { householdId: owner.householdId }
      },
      select: {
        id: true,
        name: true,
        merchantName: true
      }
    }),
    prisma.category.findFirst({
      where: {
        id: parsed.data.categoryId,
        householdId: owner.householdId,
        archivedAt: null
      }
    })
  ]);
  if (!transaction || !category) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const ruleKey = merchantRuleKey(transaction);
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { categoryId: category.id }
    });
    if (parsed.data.createRule) {
      await tx.merchantRule.upsert({
        where: {
          householdId_merchantKey: {
            householdId: owner.householdId,
            merchantKey: ruleKey
          }
        },
        update: { categoryId: category.id },
        create: {
          householdId: owner.householdId,
          categoryId: category.id,
          merchantKey: ruleKey
        }
      });
    } else {
      await tx.merchantRule.deleteMany({
        where: {
          householdId: owner.householdId,
          merchantKey: ruleKey
        }
      });
    }
  });
  return NextResponse.json({
    categorized: true,
    rule: {
      active: parsed.data.createRule,
      merchantKey: merchantRuleKey(transaction)
    }
  });
}
