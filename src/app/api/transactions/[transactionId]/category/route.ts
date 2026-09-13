import { NextResponse } from "next/server";
import { z } from "zod";
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
  const parsed = categoryRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  const { transactionId } = await params;
  const [transaction, category] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: transactionId, householdId: owner.householdId }
    }),
    prisma.category.findFirst({
      where: { id: parsed.data.categoryId, householdId: owner.householdId }
    })
  ]);
  if (!transaction || !category) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { categoryId: category.id }
    });
    if (parsed.data.createRule) {
      const merchantKey = (transaction.merchantName ?? transaction.name)
        .trim()
        .toLocaleLowerCase("en-US");
      await tx.merchantRule.upsert({
        where: {
          householdId_merchantKey: {
            householdId: owner.householdId,
            merchantKey
          }
        },
        update: { categoryId: category.id },
        create: {
          householdId: owner.householdId,
          categoryId: category.id,
          merchantKey
        }
      });
    }
  });
  return NextResponse.json({ categorized: true });
}
