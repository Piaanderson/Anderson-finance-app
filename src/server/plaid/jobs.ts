import type { SyncReason } from "@prisma/client";
import { prisma } from "@/server/db";

export async function enqueuePlaidSync(
  plaidItemId: string,
  reason: SyncReason
) {
  const dedupeKey = `plaid-sync:${plaidItemId}`;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.syncJob.upsert({
      where: { dedupeKey },
      update: {},
      create: { plaidItemId, dedupeKey, reason }
    });

    if (existing.status === "RUNNING") {
      return tx.syncJob.update({
        where: { id: existing.id },
        data: { rerunRequested: true, reason }
      });
    }

    if (existing.status === "PENDING") {
      return tx.syncJob.update({
        where: { id: existing.id },
        data: {
          reason,
          runAfter: new Date()
        }
      });
    }

    return tx.syncJob.update({
      where: { id: existing.id },
      data: {
        reason,
        status: "PENDING",
        attempts: 0,
        rerunRequested: false,
        runAfter: new Date(),
        lockedAt: null,
        lastError: null,
        paginationStartCursor: null,
        paginationCursor: null
      }
    });
  });
}

type ClaimOptions = {
  dedupeKey?: string;
  now?: Date;
};

export async function recoverStaleSyncJobs({
  dedupeKey,
  now = new Date()
}: ClaimOptions = {}) {
  const staleBefore = new Date(now.getTime() - 15 * 60_000);
  return prisma.syncJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: staleBefore },
      ...(dedupeKey ? { dedupeKey } : {})
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      lastError: "Recovered after an interrupted worker."
    }
  });
}

export async function claimNextSyncJob({
  dedupeKey,
  now = new Date()
}: ClaimOptions = {}) {
  await recoverStaleSyncJobs({ dedupeKey, now });
  const candidate = await prisma.syncJob.findFirst({
    where: {
      status: "PENDING",
      runAfter: { lte: now },
      ...(dedupeKey ? { dedupeKey } : {})
    },
    orderBy: { createdAt: "asc" }
  });
  if (!candidate) return null;

  const claimed = await prisma.syncJob.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: {
      status: "RUNNING",
      lockedAt: now,
      rerunRequested: false,
      attempts: { increment: 1 }
    }
  });

  if (claimed.count !== 1) return null;
  return prisma.syncJob.findUnique({ where: { id: candidate.id } });
}
