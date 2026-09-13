import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  assertHouseholdOwnership,
  ForbiddenError
} from "@/server/authorization";
import { requireApiHousehold } from "@/server/households";
import { plaid } from "@/server/plaid/client";
import { enqueuePlaidSync } from "@/server/plaid/jobs";
import { encryptSecret } from "@/server/secrets";

const exchangeRequest = z.object({
  publicToken: z.string().min(1),
  institutionId: z.string().nullable().optional(),
  institutionName: z.string().nullable().optional()
});

export async function POST(request: Request) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = exchangeRequest.parse(await request.json());
    const response = await plaid.itemPublicTokenExchange({
      public_token: body.publicToken
    });
    const existing = await prisma.plaidItem.findUnique({
      where: { plaidItemId: response.data.item_id }
    });
    if (existing) {
      assertHouseholdOwnership(owner.householdId, existing.householdId);
    }

    const encrypted = encryptSecret(response.data.access_token);
    const item = await prisma.plaidItem.upsert({
      where: { plaidItemId: response.data.item_id },
      update: {
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        encryptionKeyVersion: encrypted.keyVersion,
        institutionId: body.institutionId,
        institutionName: body.institutionName,
        status: "ACTIVE",
        errorCode: null
      },
      create: {
        householdId: owner.householdId,
        linkedByUserId: owner.userId,
        plaidItemId: response.data.item_id,
        institutionId: body.institutionId,
        institutionName: body.institutionName,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        encryptionKeyVersion: encrypted.keyVersion
      }
    });
    await enqueuePlaidSync(item.id, "INITIAL");

    return NextResponse.json({ connected: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "plaid.exchange.failed",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    );
    return NextResponse.json(
      { error: "The bank connection could not be completed." },
      { status: 400 }
    );
  }
}
