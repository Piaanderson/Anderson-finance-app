import { prisma } from "@/server/db";

export async function getAccounts(householdId: string) {
  const accounts = await prisma.financialAccount.findMany({
    where: { householdId, isActive: true },
    include: {
      plaidItem: {
        select: {
          institutionName: true,
          status: true,
          lastSyncedAt: true
        }
      }
    },
    orderBy: [{ type: "asc" }, { name: "asc" }]
  });

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    institution: account.plaidItem.institutionName ?? "Connected institution",
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    currentBalance: account.currentBalance?.toNumber() ?? 0,
    availableBalance: account.availableBalance?.toNumber() ?? null,
    currency: account.isoCurrencyCode ?? "USD",
    connectionStatus: account.plaidItem.status,
    lastSyncedAt: account.plaidItem.lastSyncedAt
  }));
}
