import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";

export type OpsSnapshot = {
  generatedAt: string;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  oldestPendingAgeSeconds: number | null;
  loginRequiredItems: number;
  errorItems: number;
  staleActiveItems: number;
  loginRequiredItemIds: string[];
  errorItemIds: string[];
  staleActiveItemIds: string[];
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function getOpsSnapshot(
  now = new Date(),
  prisma: PrismaClient = defaultPrisma
): Promise<OpsSnapshot> {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const staleActiveWhere = {
    status: "ACTIVE" as const,
    OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }]
  };
  const [
    pendingJobs,
    runningJobs,
    failedJobs,
    oldestPending,
    loginRequired,
    errored,
    staleActive
  ] = await Promise.all([
    prisma.syncJob.count({ where: { status: "PENDING" } }),
    prisma.syncJob.count({ where: { status: "RUNNING" } }),
    prisma.syncJob.count({ where: { status: "FAILED" } }),
    prisma.syncJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { runAfter: "asc" },
      select: { runAfter: true }
    }),
    prisma.plaidItem.findMany({
      where: { status: "LOGIN_REQUIRED" },
      select: { id: true },
      orderBy: { id: "asc" }
    }),
    prisma.plaidItem.findMany({
      where: { status: "ERROR" },
      select: { id: true },
      orderBy: { id: "asc" }
    }),
    prisma.plaidItem.findMany({
      where: staleActiveWhere,
      select: { id: true },
      orderBy: { id: "asc" }
    })
  ]);

  return {
    generatedAt: now.toISOString(),
    pendingJobs,
    runningJobs,
    failedJobs,
    oldestPendingAgeSeconds: oldestPending
      ? Math.max(
          0,
          Math.floor((now.getTime() - oldestPending.runAfter.getTime()) / 1000)
        )
      : null,
    loginRequiredItems: loginRequired.length,
    errorItems: errored.length,
    staleActiveItems: staleActive.length,
    loginRequiredItemIds: loginRequired.map((item) => item.id),
    errorItemIds: errored.map((item) => item.id),
    staleActiveItemIds: staleActive.map((item) => item.id)
  };
}
