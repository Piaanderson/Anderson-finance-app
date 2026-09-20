import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { safePlaidErrorCode } from "@/server/plaid/errors";
import { enqueuePlaidSync } from "@/server/plaid/jobs";
import { plaidWebhook, verifyPlaidWebhook } from "@/server/plaid/webhooks";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = await verifyPlaidWebhook(
    request.headers.get("Plaid-Verification"),
    rawBody
  ).catch(() => false);
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = plaidWebhook.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const event = parsed.data;
  if (!event.item_id) return new NextResponse(null, { status: 204 });

  const item = await prisma.plaidItem.findUnique({
    where: { plaidItemId: event.item_id }
  });
  if (!item) return new NextResponse(null, { status: 204 });

  if (event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
    await enqueuePlaidSync(item.id, "WEBHOOK");
  } else if (event.webhook_code === "LOGIN_REPAIRED") {
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { status: "ACTIVE", errorCode: null }
    });
    await enqueuePlaidSync(item.id, "WEBHOOK");
  } else if (event.webhook_code === "ERROR") {
    const errorCode =
      safePlaidErrorCode(event.error?.error_code) ?? "ITEM_ERROR";
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: {
        status:
          errorCode === "ITEM_LOGIN_REQUIRED" ? "LOGIN_REQUIRED" : "ERROR",
        errorCode
      }
    });
  } else if (
    event.webhook_code === "PENDING_EXPIRATION" ||
    event.webhook_code === "PENDING_DISCONNECT"
  ) {
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: {
        status: "LOGIN_REQUIRED",
        errorCode: event.webhook_code
      }
    });
  }

  return new NextResponse(null, { status: 204 });
}
