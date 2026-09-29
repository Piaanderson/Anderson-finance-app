import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { prisma } from "@/server/db";
import { rotatePlaidAccessTokens } from "@/server/plaid/token-rotation";
import {
  assertIsolatedRuntime,
  resolveDeployContext
} from "@/server/runtime-context";
import { decryptSecret, encryptSecret } from "@/server/secrets";

function decodeKey(name: string) {
  const encoded = process.env[name];
  if (!encoded) throw new Error(`${name} is required for the exercise.`);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes.`);
  }
  return key;
}

export async function exerciseStagingTokenRotation({
  requireIsolatedStaging = true
}: {
  requireIsolatedStaging?: boolean;
} = {}) {
  assertIsolatedRuntime();
  if (resolveDeployContext() !== "staging") {
    throw new Error("The token-rotation exercise is allowed only in staging.");
  }

  const currentVersion = Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION);
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 2) {
    throw new Error(
      "The staging exercise requires TOKEN_ENCRYPTION_KEY_VERSION of at least 2."
    );
  }
  const previousVersion = currentVersion - 1;
  const previousKeyName = `TOKEN_ENCRYPTION_KEY_V${previousVersion}`;
  const previousKey = decodeKey(previousKeyName);
  const currentKey = decodeKey("TOKEN_ENCRYPTION_KEY");
  if (previousKey.equals(currentKey)) {
    throw new Error("The staging current and previous encryption keys differ.");
  }
  const existingItems = await prisma.plaidItem.count({
    where: { status: { not: "REMOVED" } }
  });
  if (requireIsolatedStaging && existingItems !== 0) {
    throw new Error(
      "The staging rotation exercise requires no pre-existing active Plaid Items."
    );
  }

  const fixtureKey = `rotation-${randomUUID()}`;
  const userId = `${fixtureKey}-user`;
  const householdId = `${fixtureKey}-household`;
  const itemId = `${fixtureKey}-item`;
  const plaintext = `access-sandbox-fixture-${randomBytes(16).toString("hex")}`;
  const encrypted = encryptSecret(plaintext, previousKey);

  let cleanedUp = false;
  try {
    await prisma.user.create({
      data: { id: userId, email: `${fixtureKey}@example.test` }
    });
    await prisma.household.create({
      data: { id: householdId, name: "Staging rotation fixture" }
    });
    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${fixtureKey}-plaid-item`,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        encryptionKeyVersion: previousVersion,
        status: "ACTIVE"
      }
    });

    const result = await rotatePlaidAccessTokens({ itemIds: [itemId] });
    const rotated = await prisma.plaidItem.findUniqueOrThrow({
      where: { id: itemId },
      select: {
        accessTokenCiphertext: true,
        accessTokenIv: true,
        accessTokenTag: true,
        encryptionKeyVersion: true
      }
    });
    const ciphertextChanged =
      rotated.accessTokenCiphertext !== encrypted.ciphertext;
    const decryptsWithCurrentKey =
      decryptSecret({
        ciphertext: rotated.accessTokenCiphertext,
        iv: rotated.accessTokenIv,
        tag: rotated.accessTokenTag,
        keyVersion: rotated.encryptionKeyVersion
      }) === plaintext;
    const previousKeyRetained =
      process.env[previousKeyName] === previousKey.toString("base64");

    if (
      result.rotated !== 1 ||
      result.remainingOld !== 0 ||
      rotated.encryptionKeyVersion !== currentVersion ||
      !ciphertextChanged ||
      !decryptsWithCurrentKey ||
      !previousKeyRetained
    ) {
      throw new Error("The staging token-rotation exercise did not verify.");
    }

    return {
      currentVersion,
      previousVersion,
      rotated: result.rotated,
      remainingOld: result.remainingOld,
      ciphertextChanged,
      decryptsWithCurrentKey,
      previousKeyRetained,
      allNonRemovedItemsOnCurrentVersion: requireIsolatedStaging
        ? true
        : "not-checked"
    };
  } finally {
    await prisma.household.deleteMany({ where: { id: householdId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    cleanedUp =
      (await prisma.plaidItem.count({ where: { id: itemId } })) === 0 &&
      (await prisma.household.count({ where: { id: householdId } })) === 0 &&
      (await prisma.user.count({ where: { id: userId } })) === 0;
    const remainingNonCurrentItems = await prisma.plaidItem.count({
      where: {
        status: { not: "REMOVED" },
        encryptionKeyVersion: { not: currentVersion }
      }
    });
    if (!cleanedUp) {
      throw new Error("The staging rotation fixture cleanup failed.");
    }
    if (requireIsolatedStaging && remainingNonCurrentItems !== 0) {
      throw new Error("Staging still has Plaid Items on an older key version.");
    }
  }
}

async function main() {
  const result = await exerciseStagingTokenRotation();
  console.info(
    JSON.stringify({
      level: "info",
      event: "staging.token-rotation.verified",
      ...result,
      fixtureCleanedUp: true
    })
  );
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main()
    .catch(() => {
      console.error(
        JSON.stringify({
          level: "error",
          event: "staging.token-rotation.failed",
          message: "Staging token-rotation exercise failed."
        })
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
