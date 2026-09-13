import type { SyncReason } from "@prisma/client";
import { prisma } from "@/server/db";

export async function enqueuePlaidSync(
  plaidItemId: string,
  reason: SyncReason
) {
  const dedupeKey = `plaid-sync:${plaidItemId}`;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.syncJob.findUnique({ where: { dedupeKey } });
    if (existing?.status === "RUNNING") {
      return tx.syncJob.update({
        where: { id: existing.id },
        data: { rerunRequested: true, reason }
      });
    }
    return tx.syncJob.upsert({
      where: { dedupeKey },
      update: {
        reason,
        status: "PENDING",
        rerunRequested: false,
        runAfter: new Date(),
        lockedAt: null,
        lastError: null
      },
      create: { plaidItemId, dedupeKey, reason }
    });
  });
}

export async function claimNextSyncJob() {
  await prisma.syncJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: new Date(Date.now() - 15 * 60_000) }
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      lastError: "Recovered after an interrupted worker."
    }
  });
  const candidate = await prisma.syncJob.findFirst({
    where: {
      status: "PENDING",
      runAfter: { lte: new Date() }
    },
    orderBy: { createdAt: "asc" }
  });
  if (!candidate) return null;

  const claimed = await prisma.syncJob.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      rerunRequested: false,
      attempts: { increment: 1 }
    }
  });

  if (claimed.count !== 1) return null;
  return prisma.syncJob.findUnique({
    where: { id: candidate.id },
    include: { plaidItem: true }
  });
}
