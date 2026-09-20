import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webhookVerificationKeyGet: vi.fn(),
  findItem: vi.fn(),
  updateItem: vi.fn(),
  enqueuePlaidSync: vi.fn()
}));

vi.mock("@/server/plaid/client", () => ({
  plaid: {
    webhookVerificationKeyGet: mocks.webhookVerificationKeyGet
  }
}));

vi.mock("@/server/db", () => ({
  prisma: {
    plaidItem: {
      findUnique: mocks.findItem,
      update: mocks.updateItem
    }
  }
}));

vi.mock("@/server/plaid/jobs", () => ({
  enqueuePlaidSync: mocks.enqueuePlaidSync
}));

import { POST } from "@/app/api/plaid/webhook/route";
import { verifyPlaidWebhook } from "./webhooks";

type SigningKey = {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
};

async function signingKey(): Promise<SigningKey> {
  const kid = `test-${randomUUID()}`;
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(publicKey);
  return {
    kid,
    privateKey,
    publicJwk: {
      ...publicJwk,
      alg: "ES256",
      kid,
      use: "sig"
    }
  };
}

function bodyHash(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

async function signedWebhook(
  key: SigningKey,
  body: string,
  {
    issuedAt = Math.floor(Date.now() / 1000),
    includeIssuedAt = true,
    includeHash = true,
    hash = bodyHash(body)
  }: {
    issuedAt?: number;
    includeIssuedAt?: boolean;
    includeHash?: boolean;
    hash?: string;
  } = {}
) {
  let token = new SignJWT({
    ...(includeHash ? { request_body_sha256: hash } : {})
  }).setProtectedHeader({ alg: "ES256", kid: key.kid });
  if (includeIssuedAt) token = token.setIssuedAt(issuedAt);
  return token.sign(key.privateKey);
}

function mockVerificationKey(key: SigningKey) {
  mocks.webhookVerificationKeyGet.mockImplementation(
    async ({ key_id }: { key_id: string }) => {
      if (key_id !== key.kid) throw new Error("unknown key");
      return {
        data: {
          key: {
            ...key.publicJwk,
            created_at: 1,
            expired_at: null
          },
          request_id: "test-request"
        }
      };
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findItem.mockResolvedValue(null);
  mocks.updateItem.mockResolvedValue(null);
  mocks.enqueuePlaidSync.mockResolvedValue(null);
});

describe("Plaid webhook verification", () => {
  it("accepts a valid ES256 signature and caches the public verification key", async () => {
    const key = await signingKey();
    const body = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE"
    });
    mockVerificationKey(key);
    const token = await signedWebhook(key, body);

    await expect(verifyPlaidWebhook(token, body)).resolves.toBe(true);
    await expect(verifyPlaidWebhook(token, body)).resolves.toBe(true);
    expect(mocks.webhookVerificationKeyGet).toHaveBeenCalledOnce();
    expect(mocks.webhookVerificationKeyGet).toHaveBeenCalledWith({
      key_id: key.kid
    });
  });

  it.each([
    ["missing header", null],
    ["malformed JWT", "not-a-jwt"]
  ])("rejects a %s", async (_label, token) => {
    await expect(verifyPlaidWebhook(token, "{}")).resolves.toBe(false);
    expect(mocks.webhookVerificationKeyGet).not.toHaveBeenCalled();
  });

  it("rejects algorithms other than ES256 before retrieving a key", async () => {
    const secret = randomBytes(32);
    const token = await new SignJWT({
      request_body_sha256: bodyHash("{}")
    })
      .setProtectedHeader({ alg: "HS256", kid: "symmetric-test-key" })
      .setIssuedAt()
      .sign(secret);

    await expect(verifyPlaidWebhook(token, "{}")).resolves.toBe(false);
    expect(mocks.webhookVerificationKeyGet).not.toHaveBeenCalled();
  });

  it("rejects an unknown key ID without logging key material", async () => {
    const key = await signingKey();
    const token = await signedWebhook(key, "{}");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.webhookVerificationKeyGet.mockRejectedValue(
      new Error(`unknown ${key.publicJwk.x}`)
    );

    await expect(verifyPlaidWebhook(token, "{}")).resolves.toBe(false);
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects a signature made by a different private key", async () => {
    const trusted = await signingKey();
    const attacker = await signingKey();
    mockVerificationKey(trusted);
    const token = await new SignJWT({
      request_body_sha256: bodyHash("{}")
    })
      .setProtectedHeader({ alg: "ES256", kid: trusted.kid })
      .setIssuedAt()
      .sign(attacker.privateKey);

    await expect(verifyPlaidWebhook(token, "{}")).resolves.toBe(false);
  });

  it("rejects a body hash mismatch", async () => {
    const key = await signingKey();
    mockVerificationKey(key);
    const token = await signedWebhook(key, '{"value":"original"}');

    await expect(
      verifyPlaidWebhook(token, '{"value":"changed"}')
    ).resolves.toBe(false);
  });

  it.each([
    ["issued-at", { includeIssuedAt: false }],
    ["body hash", { includeHash: false }]
  ])("rejects a token missing the %s claim", async (_label, options) => {
    const key = await signingKey();
    mockVerificationKey(key);
    const token = await signedWebhook(key, "{}", options);

    await expect(verifyPlaidWebhook(token, "{}")).resolves.toBe(false);
  });

  it("rejects stale and implausibly future-issued tokens", async () => {
    const key = await signingKey();
    const now = Math.floor(Date.now() / 1000);
    mockVerificationKey(key);
    const stale = await signedWebhook(key, "{}", { issuedAt: now - 360 });
    const future = await signedWebhook(key, "{}", { issuedAt: now + 360 });

    await expect(verifyPlaidWebhook(stale, "{}")).resolves.toBe(false);
    await expect(verifyPlaidWebhook(future, "{}")).resolves.toBe(false);
  });
});

describe("Plaid webhook route", () => {
  it("returns 400 for malformed JSON after verifying its valid signature", async () => {
    const key = await signingKey();
    const rawBody = '{"webhook_type":';
    mockVerificationKey(key);
    const token = await signedWebhook(key, rawBody);

    const response = await POST(
      new Request("http://currents.test/api/plaid/webhook", {
        method: "POST",
        headers: { "Plaid-Verification": token },
        body: rawBody
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.webhookVerificationKeyGet).toHaveBeenCalledOnce();
    expect(mocks.findItem).not.toHaveBeenCalled();
  });

  it("ignores a valid event for an unknown Item", async () => {
    const key = await signingKey();
    const rawBody = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "unknown-item"
    });
    mockVerificationKey(key);
    const token = await signedWebhook(key, rawBody);

    const response = await POST(
      new Request("http://currents.test/api/plaid/webhook", {
        method: "POST",
        headers: { "Plaid-Verification": token },
        body: rawBody
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.enqueuePlaidSync).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("ignores irrelevant valid events for a known Item", async () => {
    const key = await signingKey();
    const rawBody = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "DEFAULT_UPDATE",
      item_id: "known-item"
    });
    mockVerificationKey(key);
    mocks.findItem.mockResolvedValue({ id: "local-item" });
    const token = await signedWebhook(key, rawBody);

    const response = await POST(
      new Request("http://currents.test/api/plaid/webhook", {
        method: "POST",
        headers: { "Plaid-Verification": token },
        body: rawBody
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.enqueuePlaidSync).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });
});
