import { createHash } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { z } from "zod";
import { plaid } from "./client";
import { safeEqualHex } from "@/server/secrets";

const cachedKeys = new Map<string, CryptoKey>();

export async function verifyPlaidWebhook(
  verification: string | null,
  rawBody: string
) {
  if (!verification) return false;
  const { kid, alg } = decodeProtectedHeader(verification);
  if (!kid || alg !== "ES256") return false;

  let key = cachedKeys.get(kid);
  if (!key) {
    const response = await plaid.webhookVerificationKeyGet({ key_id: kid });
    key = (await importJWK(response.data.key as JWK, "ES256")) as CryptoKey;
    cachedKeys.set(kid, key);
  }

  const verified = await jwtVerify(verification, key, {
    algorithms: ["ES256"]
  });
  const issuedAt = verified.payload.iat;
  const expectedHash = verified.payload.request_body_sha256;
  if (
    typeof issuedAt !== "number" ||
    Date.now() / 1000 - issuedAt > 5 * 60 ||
    typeof expectedHash !== "string"
  ) {
    return false;
  }
  const actualHash = createHash("sha256").update(rawBody).digest("hex");
  return safeEqualHex(actualHash, expectedHash);
}

export const plaidWebhook = z
  .object({
    webhook_type: z.string(),
    webhook_code: z.string(),
    item_id: z.string().optional(),
    error: z
      .object({
        error_code: z.string().optional()
      })
      .optional()
  })
  .passthrough();
