import { createHash } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { z } from "zod";
import { plaid } from "./client";
import { safeEqualHex } from "@/server/secrets";

const cachedKeys = new Map<string, CryptoKey>();
const MAX_CACHED_KEYS = 8;

export async function verifyPlaidWebhook(
  verification: string | null,
  rawBody: string
) {
  try {
    if (!verification) return false;
    const { kid, alg } = decodeProtectedHeader(verification);
    if (!kid || alg !== "ES256") return false;

    let key = cachedKeys.get(kid);
    if (!key) {
      const response = await plaid.webhookVerificationKeyGet({ key_id: kid });
      key = (await importJWK(response.data.key as JWK, "ES256")) as CryptoKey;
      if (cachedKeys.size >= MAX_CACHED_KEYS) {
        const oldestKeyId = cachedKeys.keys().next().value;
        if (oldestKeyId) cachedKeys.delete(oldestKeyId);
      }
      cachedKeys.set(kid, key);
    }

    const verified = await jwtVerify(verification, key, {
      algorithms: ["ES256"],
      maxTokenAge: "5 min",
      requiredClaims: ["request_body_sha256"]
    });
    const expectedHash = verified.payload.request_body_sha256;
    if (
      typeof expectedHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(expectedHash)
    ) {
      return false;
    }
    const actualHash = createHash("sha256").update(rawBody).digest("hex");
    return safeEqualHex(actualHash, expectedHash);
  } catch {
    return false;
  }
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
