import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

export async function GET() {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (owner.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const credentials = await prisma.passkeyCredential.findMany({
    where: { userId: owner.userId, revokedAt: null },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true
    },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json(
    { credentials },
    { headers: { "Cache-Control": "no-store" } }
  );
}
