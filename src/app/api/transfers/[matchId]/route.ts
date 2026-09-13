import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { matchId } = await params;
  const deleted = await prisma.transferMatch.deleteMany({
    where: { id: matchId, householdId: owner.householdId }
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
