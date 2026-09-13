import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const matchRequest = z.object({
  outgoingTransactionId: z.string().min(1),
  incomingTransactionId: z.string().min(1)
});

export async function POST(request: Request) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = matchRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transfer legs" },
      { status: 400 }
    );
  }
  const { outgoingTransactionId, incomingTransactionId } = parsed.data;
  if (outgoingTransactionId === incomingTransactionId) {
    return NextResponse.json(
      { error: "A transaction cannot match itself." },
      { status: 400 }
    );
  }
  const [outgoing, incoming] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: outgoingTransactionId, householdId: owner.householdId }
    }),
    prisma.transaction.findFirst({
      where: { id: incomingTransactionId, householdId: owner.householdId }
    })
  ]);
  if (!outgoing || !incoming) {
    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 }
    );
  }
  const amountDifference = Math.abs(
    Math.abs(outgoing.amount.toNumber()) - Math.abs(incoming.amount.toNumber())
  );
  const dayDifference =
    Math.abs(outgoing.date.getTime() - incoming.date.getTime()) / 86_400_000;
  if (
    outgoing.amount.toNumber() <= 0 ||
    incoming.amount.toNumber() >= 0 ||
    amountDifference > 0.01 ||
    dayDifference > 7
  ) {
    return NextResponse.json(
      { error: "Legs must have opposite equal amounts within seven days." },
      { status: 422 }
    );
  }

  const match = await prisma.transferMatch.create({
    data: {
      householdId: owner.householdId,
      outgoingTransactionId,
      incomingTransactionId
    }
  });
  return NextResponse.json({ id: match.id }, { status: 201 });
}
