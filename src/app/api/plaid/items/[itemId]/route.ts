import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";
import { plaid } from "@/server/plaid/client";
import { enqueuePlaidSync } from "@/server/plaid/jobs";
import { decryptSecret } from "@/server/secrets";

type Context = { params: Promise<{ itemId: string }> };

async function ownedItem(itemId: string, householdId: string) {
  return prisma.plaidItem.findFirst({
    where: { id: itemId, householdId }
  });
}

export async function POST(_request: Request, context: Context) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { itemId } = await context.params;
  const item = await ownedItem(itemId, owner.householdId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await enqueuePlaidSync(item.id, "MANUAL");
  return NextResponse.json({ queued: true }, { status: 202 });
}

export async function DELETE(_request: Request, context: Context) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { itemId } = await context.params;
  const item = await ownedItem(itemId, owner.householdId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const accessToken = decryptSecret({
    ciphertext: item.accessTokenCiphertext,
    iv: item.accessTokenIv,
    tag: item.accessTokenTag,
    keyVersion: item.encryptionKeyVersion
  });
  await plaid.itemRemove({ access_token: accessToken });
  await prisma.$transaction([
    prisma.plaidItem.update({
      where: { id: item.id },
      data: {
        status: "REMOVED",
        accessTokenCiphertext: "",
        accessTokenIv: "",
        accessTokenTag: "",
        syncCursor: null
      }
    }),
    prisma.financialAccount.updateMany({
      where: { plaidItemId: item.id },
      data: { isActive: false }
    })
  ]);
  return new NextResponse(null, { status: 204 });
}
