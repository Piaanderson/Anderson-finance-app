import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";
import { plaid } from "@/server/plaid/client";
import { sanitizedPlaidError } from "@/server/plaid/errors";
import { enqueuePlaidSync } from "@/server/plaid/jobs";
import { decryptSecret } from "@/server/secrets";

type Context = { params: Promise<{ itemId: string }> };

async function ownedItem(itemId: string, householdId: string) {
  return prisma.plaidItem.findFirst({
    where: { id: itemId, householdId, status: { not: "REMOVED" } }
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
  try {
    await plaid.itemRemove({ access_token: accessToken });
  } catch (error) {
    const safeError = sanitizedPlaidError(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "plaid.item_remove.failed",
        itemId: item.id,
        ...(safeError.code ? { errorCode: safeError.code } : {})
      })
    );
    return NextResponse.json(
      { error: "The connection could not be disconnected." },
      { status: 502 }
    );
  }
  await prisma.$transaction([
    prisma.plaidItem.update({
      where: { id: item.id },
      data: {
        status: "REMOVED",
        accessTokenCiphertext: "",
        accessTokenIv: "",
        accessTokenTag: "",
        syncCursor: null,
        errorCode: null
      }
    }),
    prisma.financialAccount.updateMany({
      where: { plaidItemId: item.id, householdId: owner.householdId },
      data: { isActive: false }
    }),
    prisma.syncJob.updateMany({
      where: {
        plaidItemId: item.id,
        status: { in: ["PENDING", "RUNNING"] }
      },
      data: {
        status: "FAILED",
        rerunRequested: false,
        lockedAt: null,
        lastError: "Canceled because the connection was disconnected.",
        paginationStartCursor: null,
        paginationCursor: null
      }
    })
  ]);
  return new NextResponse(null, { status: 204 });
}
