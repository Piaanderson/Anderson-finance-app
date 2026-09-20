import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CountryCode,
  Products,
  assertPlaidConfigured,
  plaid
} from "@/server/plaid/client";
import { sanitizedPlaidError } from "@/server/plaid/errors";
import { requireApiHousehold } from "@/server/households";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/secrets";

const linkTokenRequest = z.object({ itemId: z.string().min(1).optional() });

export async function POST(request: Request) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await request.text();
    const input = linkTokenRequest.parse(
      rawBody.length > 0 ? JSON.parse(rawBody) : {}
    );
    const item = input.itemId
      ? await prisma.plaidItem.findFirst({
          where: {
            id: input.itemId,
            householdId: owner.householdId,
            status: { not: "REMOVED" }
          },
          select: {
            accessTokenCiphertext: true,
            accessTokenIv: true,
            accessTokenTag: true,
            encryptionKeyVersion: true
          }
        })
      : null;
    if (input.itemId && !item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    assertPlaidConfigured();
    const baseRequest = {
      user: { client_user_id: owner.userId },
      client_name: "Currents",
      language: "en",
      country_codes: [CountryCode.Us]
    };
    const response = await plaid.linkTokenCreate(
      item
        ? {
            ...baseRequest,
            access_token: decryptSecret({
              ciphertext: item.accessTokenCiphertext,
              iv: item.accessTokenIv,
              tag: item.accessTokenTag,
              keyVersion: item.encryptionKeyVersion
            })
          }
        : {
            ...baseRequest,
            products: [Products.Transactions],
            additional_consented_products: [
              Products.Liabilities,
              Products.Investments
            ],
            transactions: { days_requested: 730 },
            webhook: process.env.PLAID_WEBHOOK_URL
          }
    );
    return NextResponse.json({
      linkToken: response.data.link_token,
      mode: item ? "update" : "create"
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const safeError = sanitizedPlaidError(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "plaid.link_token.failed",
        ...(safeError.code ? { errorCode: safeError.code } : {})
      })
    );
    return NextResponse.json(
      { error: "Unable to start a secure bank connection." },
      { status: 503 }
    );
  }
}
