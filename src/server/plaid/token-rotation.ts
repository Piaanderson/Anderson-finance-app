import { prisma } from "@/server/db";
import { resolveDeployContext } from "@/server/runtime-context";
import { rotateEncryptedSecret } from "@/server/secrets";

export async function rotatePlaidAccessTokens({
  itemIds
}: {
  itemIds?: string[];
} = {}) {
  const context = resolveDeployContext();
  if (context !== "staging") {
    throw new Error("Plaid token rotation is allowed only in staging.");
  }

  const currentVersion = Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION);
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new Error("TOKEN_ENCRYPTION_KEY_VERSION must be a positive integer.");
  }

  const candidates = await prisma.plaidItem.findMany({
    where: {
      status: { not: "REMOVED" },
      encryptionKeyVersion: { not: currentVersion },
      accessTokenCiphertext: { not: "" },
      ...(itemIds ? { id: { in: itemIds } } : {})
    },
    select: { id: true },
    orderBy: { id: "asc" }
  });

  let rotated = 0;
  for (const candidate of candidates) {
    const didRotate = await prisma.$transaction(async (tx) => {
      const item = await tx.plaidItem.findFirst({
        where: {
          id: candidate.id,
          status: { not: "REMOVED" },
          encryptionKeyVersion: { not: currentVersion },
          accessTokenCiphertext: { not: "" }
        },
        select: {
          id: true,
          accessTokenCiphertext: true,
          accessTokenIv: true,
          accessTokenTag: true,
          encryptionKeyVersion: true
        }
      });
      if (!item) return false;

      const next = rotateEncryptedSecret({
        ciphertext: item.accessTokenCiphertext,
        iv: item.accessTokenIv,
        tag: item.accessTokenTag,
        keyVersion: item.encryptionKeyVersion
      });
      const updated = await tx.plaidItem.updateMany({
        where: {
          id: item.id,
          encryptionKeyVersion: item.encryptionKeyVersion,
          accessTokenCiphertext: item.accessTokenCiphertext
        },
        data: {
          accessTokenCiphertext: next.ciphertext,
          accessTokenIv: next.iv,
          accessTokenTag: next.tag,
          encryptionKeyVersion: next.keyVersion
        }
      });
      return updated.count === 1;
    });
    if (didRotate) rotated += 1;
  }

  const remainingOld = await prisma.plaidItem.count({
    where: {
      status: { not: "REMOVED" },
      encryptionKeyVersion: { not: currentVersion },
      accessTokenCiphertext: { not: "" },
      ...(itemIds ? { id: { in: itemIds } } : {})
    }
  });

  return { rotated, remainingOld, currentVersion };
}
