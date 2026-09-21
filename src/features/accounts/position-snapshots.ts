import { createHash } from "node:crypto";
import { Prisma, type PositionSnapshotSource } from "@prisma/client";
import { prisma } from "@/server/db";

type PositionSnapshotWrite = {
  householdId: string;
  accountId: string;
  signedBalance: Prisma.Decimal.Value | null;
  isoCurrencyCode: string | null;
  effectiveAt: Date;
  source: PositionSnapshotSource;
  skipWhenUnchanged?: boolean;
};

function canonicalBalance(value: Prisma.Decimal.Value | null) {
  return value === null ? "missing" : new Prisma.Decimal(value).toFixed(2);
}

function snapshotDedupeKey(input: PositionSnapshotWrite) {
  return createHash("sha256")
    .update(
      [
        input.householdId,
        input.accountId,
        input.effectiveAt.toISOString(),
        canonicalBalance(input.signedBalance),
        input.isoCurrencyCode ?? "unknown",
        input.source
      ].join("|")
    )
    .digest("hex");
}

export async function writePositionSnapshot(
  tx: Prisma.TransactionClient,
  input: PositionSnapshotWrite
) {
  const account = await tx.financialAccount.findFirst({
    where: { id: input.accountId, householdId: input.householdId },
    select: { id: true }
  });
  if (!account) throw new Error("Account not found.");

  const latest = await tx.accountPositionSnapshot.findFirst({
    where: { accountId: input.accountId, householdId: input.householdId },
    orderBy: [{ effectiveAt: "desc" }, { observedAt: "desc" }],
    select: { signedBalance: true, isoCurrencyCode: true }
  });
  const balance = canonicalBalance(input.signedBalance);
  const unchanged =
    latest &&
    canonicalBalance(latest.signedBalance) === balance &&
    latest.isoCurrencyCode === input.isoCurrencyCode;

  if (!(input.skipWhenUnchanged && unchanged)) {
    const dedupeKey = snapshotDedupeKey(input);
    await tx.accountPositionSnapshot.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        householdId: input.householdId,
        accountId: input.accountId,
        signedBalance:
          input.signedBalance === null
            ? null
            : new Prisma.Decimal(input.signedBalance),
        isoCurrencyCode: input.isoCurrencyCode,
        effectiveAt: input.effectiveAt,
        source: input.source,
        dedupeKey
      }
    });
  }

  const current = await tx.accountPositionSnapshot.findFirstOrThrow({
    where: { accountId: input.accountId, householdId: input.householdId },
    orderBy: [{ effectiveAt: "desc" }, { observedAt: "desc" }],
    select: { signedBalance: true, isoCurrencyCode: true }
  });
  await tx.financialAccount.update({
    where: { id: input.accountId },
    data: {
      currentBalance: current.signedBalance,
      isoCurrencyCode: current.isoCurrencyCode
    }
  });
}

export async function getHouseholdSnapshotObservations(
  householdId: string,
  since: Date
) {
  return prisma.accountPositionSnapshot.findMany({
    where: {
      householdId,
      effectiveAt: { gte: since },
      account: { householdId }
    },
    select: {
      id: true,
      accountId: true,
      signedBalance: true,
      isoCurrencyCode: true,
      effectiveAt: true,
      observedAt: true,
      source: true
    },
    orderBy: [{ effectiveAt: "asc" }, { observedAt: "asc" }]
  });
}
