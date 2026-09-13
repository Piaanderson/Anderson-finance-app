import { NextResponse } from "next/server";
import {
  CountryCode,
  Products,
  assertPlaidConfigured,
  plaid
} from "@/server/plaid/client";
import { requireApiHousehold } from "@/server/households";

export async function POST() {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertPlaidConfigured();
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: owner.userId },
      client_name: "Currents",
      language: "en",
      country_codes: [CountryCode.Us],
      products: [Products.Transactions],
      additional_consented_products: [
        Products.Liabilities,
        Products.Investments
      ],
      transactions: { days_requested: 730 },
      webhook: process.env.PLAID_WEBHOOK_URL
    });
    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "plaid.link_token.failed",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    );
    return NextResponse.json(
      { error: "Unable to start a secure bank connection." },
      { status: 503 }
    );
  }
}
