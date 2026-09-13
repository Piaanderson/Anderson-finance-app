import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const allocationRequest = z.object({
  planned: z.number().min(0).max(10_000_000),
  destinationAccountId: z.string().nullable().optional()
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ allocationId: string }> }
) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = allocationRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid allocation" }, { status: 400 });
  }
  const { allocationId } = await params;
  const allocation = await prisma.budgetAllocation.findFirst({
    where: {
      id: allocationId,
      budgetMonth: { householdId: owner.householdId }
    }
  });
  if (!allocation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (parsed.data.destinationAccountId) {
    const account = await prisma.financialAccount.findFirst({
      where: {
        id: parsed.data.destinationAccountId,
        householdId: owner.householdId
      }
    });
    if (!account) {
      return NextResponse.json(
        { error: "Destination account not found" },
        { status: 404 }
      );
    }
  }
  await prisma.budgetAllocation.update({
    where: { id: allocation.id },
    data: parsed.data
  });
  return NextResponse.json({ updated: true });
}
