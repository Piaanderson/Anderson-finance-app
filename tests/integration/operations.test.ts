import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getOpsSnapshot } from "@/server/ops/snapshot";
import { exerciseStagingTokenRotation } from "@/server/plaid/staging-rotation-exercise";
import { rotatePlaidAccessTokens } from "@/server/plaid/token-rotation";
import { decryptSecret, encryptSecret } from "@/server/secrets";

const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

async function createItem(status: "ACTIVE" | "LOGIN_REQUIRED" | "ERROR") {
  const key = `ops-${randomUUID()}`;
  const userId = `${key}-user`;
  const householdId = `${key}-household`;
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  await prisma.user.create({
    data: { id: userId, email: `${key}@example.test` }
  });
  await prisma.household.create({
    data: { id: householdId, name: "Ops fixture" }
  });
  const item = await prisma.plaidItem.create({
    data: {
      id: `${key}-item`,
      householdId,
      linkedByUserId: userId,
      plaidItemId: `${key}-plaid-item`,
      accessTokenCiphertext: "fixture-ciphertext",
      accessTokenIv: "fixture-iv",
      accessTokenTag: "fixture-tag",
      status
    }
  });
  return { key, item };
}

afterEach(async () => {
  const households = createdHouseholds.splice(0);
  const users = createdUsers.splice(0);
  await prisma.household.deleteMany({ where: { id: { in: households } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("operations snapshot", () => {
  it("counts lag, failed jobs, and login-required Items without payloads", async () => {
    const login = await createItem("LOGIN_REQUIRED");
    const failedItem = await createItem("ERROR");
    const pendingAt = new Date("2026-09-27T00:00:00.000Z");
    await prisma.syncJob.create({
      data: {
        id: `${login.key}-pending`,
        plaidItemId: login.item.id,
        dedupeKey: `plaid-sync:${login.item.id}`,
        reason: "WEBHOOK",
        status: "PENDING",
        runAfter: pendingAt
      }
    });
    await prisma.syncJob.create({
      data: {
        id: `${failedItem.key}-failed`,
        plaidItemId: failedItem.item.id,
        dedupeKey: `plaid-sync:${failedItem.item.id}`,
        reason: "MANUAL",
        status: "FAILED"
      }
    });

    const snapshot = await getOpsSnapshot(new Date("2026-09-27T01:00:00.000Z"));
    expect(snapshot.generatedAt).toBe("2026-09-27T01:00:00.000Z");
    expect(snapshot.loginRequiredItems).toBeGreaterThanOrEqual(1);
    expect(snapshot.errorItems).toBeGreaterThanOrEqual(1);
    expect(snapshot.failedJobs).toBeGreaterThanOrEqual(1);
    expect(snapshot.pendingJobs).toBeGreaterThanOrEqual(1);
    expect(snapshot.loginRequiredItemIds).toContain(login.item.id);
    expect(snapshot.errorItemIds).toContain(failedItem.item.id);
    expect(
      snapshot.oldestPendingAgeSeconds === null ||
        snapshot.oldestPendingAgeSeconds >= 0
    ).toBe(true);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("fixture-ciphertext");
    expect(serialized).not.toContain(login.item.plaidItemId);
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        "errorItemIds",
        "errorItems",
        "failedJobs",
        "generatedAt",
        "loginRequiredItemIds",
        "loginRequiredItems",
        "oldestPendingAgeSeconds",
        "pendingJobs",
        "runningJobs",
        "staleActiveItemIds",
        "staleActiveItems"
      ].sort()
    );
  });
});

describe("Plaid token rotation", () => {
  it("rewrites stored tokens onto the current key version", async () => {
    const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
    const previousVersion = process.env.TOKEN_ENCRYPTION_KEY_VERSION;
    const previousV1 = process.env.TOKEN_ENCRYPTION_KEY_V1;
    const previousRailwayEnvironment = process.env.RAILWAY_ENVIRONMENT_NAME;
    const keyV1 = randomBytes(32).toString("base64");
    const keyV2 = randomBytes(32).toString("base64");
    const fixture = await createItem("ACTIVE");

    try {
      process.env.TOKEN_ENCRYPTION_KEY = keyV1;
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = "1";
      delete process.env.TOKEN_ENCRYPTION_KEY_V1;
      const encrypted = encryptSecret("access-sandbox-secret");
      await prisma.plaidItem.update({
        where: { id: fixture.item.id },
        data: {
          accessTokenCiphertext: encrypted.ciphertext,
          accessTokenIv: encrypted.iv,
          accessTokenTag: encrypted.tag,
          encryptionKeyVersion: 1
        }
      });

      process.env.TOKEN_ENCRYPTION_KEY = keyV2;
      process.env.TOKEN_ENCRYPTION_KEY_V1 = keyV1;
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = "2";
      process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
      expect(
        decryptSecret({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          keyVersion: 1
        })
      ).toBe("access-sandbox-secret");
      const result = await rotatePlaidAccessTokens({
        itemIds: [fixture.item.id]
      });
      expect(result).toEqual({
        rotated: 1,
        remainingOld: 0,
        currentVersion: 2
      });

      const rotated = await prisma.plaidItem.findUniqueOrThrow({
        where: { id: fixture.item.id }
      });
      expect(rotated.encryptionKeyVersion).toBe(2);
      expect(rotated.accessTokenCiphertext).not.toBe(encrypted.ciphertext);
      expect(process.env.TOKEN_ENCRYPTION_KEY_V1).toBe(keyV1);
      expect(
        decryptSecret({
          ciphertext: rotated.accessTokenCiphertext,
          iv: rotated.accessTokenIv,
          tag: rotated.accessTokenTag,
          keyVersion: rotated.encryptionKeyVersion
        })
      ).toBe("access-sandbox-secret");
      process.env.RAILWAY_ENVIRONMENT_NAME = "production";
      await expect(rotatePlaidAccessTokens()).rejects.toThrow(
        /only in staging/
      );
      process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = "not-a-version";
      await expect(rotatePlaidAccessTokens()).rejects.toThrow(
        /positive integer/
      );
    } finally {
      if (previousRailwayEnvironment === undefined) {
        delete process.env.RAILWAY_ENVIRONMENT_NAME;
      } else {
        process.env.RAILWAY_ENVIRONMENT_NAME = previousRailwayEnvironment;
      }
      process.env.TOKEN_ENCRYPTION_KEY = previousKey;
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = previousVersion;
      if (previousV1 === undefined) delete process.env.TOKEN_ENCRYPTION_KEY_V1;
      else process.env.TOKEN_ENCRYPTION_KEY_V1 = previousV1;
    }
  });

  it("exercises rotation with a disposable staging-only fixture", async () => {
    const previousEnvironment = {
      AUTH_DEV_BYPASS: process.env.AUTH_DEV_BYPASS,
      DATABASE_URL: process.env.DATABASE_URL,
      PLAID_ENV: process.env.PLAID_ENV,
      RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
      TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
      TOKEN_ENCRYPTION_KEY_V1: process.env.TOKEN_ENCRYPTION_KEY_V1,
      TOKEN_ENCRYPTION_KEY_VERSION: process.env.TOKEN_ENCRYPTION_KEY_VERSION
    };

    try {
      process.env.AUTH_DEV_BYPASS = "false";
      process.env.DATABASE_URL =
        "postgresql://postgres@postgres.railway.internal:5432/railway";
      process.env.PLAID_ENV = "sandbox";
      process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
      process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      process.env.TOKEN_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64");
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = "2";

      await expect(
        exerciseStagingTokenRotation({ requireIsolatedStaging: false })
      ).resolves.toEqual({
        currentVersion: 2,
        previousVersion: 1,
        rotated: 1,
        remainingOld: 0,
        ciphertextChanged: true,
        decryptsWithCurrentKey: true,
        previousKeyRetained: true,
        allNonRemovedItemsOnCurrentVersion: "not-checked"
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
