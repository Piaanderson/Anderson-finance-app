import { prisma } from "@/server/db";

export async function getAccountOverview(householdId: string) {
  const [items, accounts] = await Promise.all([
    prisma.plaidItem.findMany({
      where: { householdId, status: { not: "REMOVED" } },
      include: {
        _count: {
          select: {
            accounts: { where: { householdId, isActive: true } }
          }
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
    }),
    prisma.financialAccount.findMany({
      where: { householdId, isActive: true },
      select: {
        id: true,
        source: true,
        classification: true,
        name: true,
        mask: true,
        type: true,
        subtype: true,
        currentBalance: true,
        availableBalance: true,
        isoCurrencyCode: true,
        plaidItem: { select: { institutionName: true } }
      },
      orderBy: [{ classification: "asc" }, { name: "asc" }]
    })
  ]);

  return {
    connections: items.map((item) => ({
      id: item.id,
      institution: item.institutionName ?? "Connected institution",
      status: item.status,
      lastSyncedAt: item.lastSyncedAt,
      job: item.syncJobs[0] ?? null,
      accountCount: item._count.accounts
    })),
    accounts: accounts.map((account) => ({
      id: account.id,
      source: account.source,
      classification: account.classification,
      name: account.name,
      institution:
        account.plaidItem?.institutionName ??
        (account.source === "MANUAL"
          ? "Manual account"
          : "Connected institution"),
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      currentBalance: account.currentBalance?.toNumber() ?? 0,
      availableBalance: account.availableBalance?.toNumber() ?? null,
      currency: account.isoCurrencyCode ?? "USD"
    }))
  };
}
