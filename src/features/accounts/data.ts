import { prisma } from "@/server/db";

export async function getAccountOverview(householdId: string) {
  const items = await prisma.plaidItem.findMany({
    where: { householdId, status: { not: "REMOVED" } },
    include: {
      accounts: {
        where: { householdId, isActive: true },
        select: {
          id: true,
          name: true,
          mask: true,
          type: true,
          subtype: true,
          currentBalance: true,
          availableBalance: true,
          isoCurrencyCode: true
        },
        orderBy: [{ type: "asc" }, { name: "asc" }]
      },
      syncJobs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          status: true,
          attempts: true,
          runAfter: true,
          updatedAt: true
        }
      }
    },
    orderBy: [{ institutionName: "asc" }, { createdAt: "asc" }]
  });

  return {
    connections: items.map((item) => ({
      id: item.id,
      institution: item.institutionName ?? "Connected institution",
      status: item.status,
      lastSyncedAt: item.lastSyncedAt,
      job: item.syncJobs[0] ?? null,
      accountCount: item.accounts.length
    })),
    accounts: items.flatMap((item) =>
      item.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        institution: item.institutionName ?? "Connected institution",
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        currentBalance: account.currentBalance?.toNumber() ?? 0,
        availableBalance: account.availableBalance?.toNumber() ?? null,
        currency: account.isoCurrencyCode ?? "USD"
      }))
    )
  };
}
