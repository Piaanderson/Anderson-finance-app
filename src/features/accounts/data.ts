import { prisma } from "@/server/db";
import { summarizePositions } from "./position-summary";

export async function getAccountOverview(householdId: string) {
  const [items, accounts, links] = await Promise.all([
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
    }),
    prisma.propertyDebtLink.findMany({
      where: {
        householdId,
        propertyAccount: { householdId, isActive: true },
        debtAccount: { householdId, isActive: true }
      },
      include: {
        propertyAccount: {
          select: {
            id: true,
            name: true,
            currentBalance: true,
            isoCurrencyCode: true
          }
        },
        debtAccount: {
          select: {
            id: true,
            name: true,
            currentBalance: true,
            isoCurrencyCode: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const mappedAccounts = accounts.map((account) => ({
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
    currentBalance: account.currentBalance?.toNumber() ?? null,
    availableBalance: account.availableBalance?.toNumber() ?? null,
    currency: account.isoCurrencyCode
  }));

  return {
    connections: items.map((item) => ({
      id: item.id,
      institution: item.institutionName ?? "Connected institution",
      status: item.status,
      lastSyncedAt: item.lastSyncedAt,
      job: item.syncJobs[0] ?? null,
      accountCount: item._count.accounts
    })),
    accounts: mappedAccounts,
    positionSummary: summarizePositions(
      mappedAccounts.map((account) => ({
        id: account.id,
        classification: account.classification,
        currentBalance: account.currentBalance,
        isoCurrencyCode: account.currency,
        isActive: true
      }))
    ),
    propertyGroups: Object.values(
      links.reduce<
        Record<
          string,
          {
            property: {
              id: string;
              name: string;
              currentBalance: number | null;
              currency: string | null;
            };
            debts: Array<{
              linkId: string;
              id: string;
              name: string;
              currentBalance: number | null;
              currency: string | null;
            }>;
          }
        >
      >((groups, link) => {
        groups[link.propertyAccountId] ??= {
          property: {
            id: link.propertyAccount.id,
            name: link.propertyAccount.name,
            currentBalance:
              link.propertyAccount.currentBalance?.toNumber() ?? null,
            currency: link.propertyAccount.isoCurrencyCode
          },
          debts: []
        };
        groups[link.propertyAccountId].debts.push({
          linkId: link.id,
          id: link.debtAccount.id,
          name: link.debtAccount.name,
          currentBalance: link.debtAccount.currentBalance?.toNumber() ?? null,
          currency: link.debtAccount.isoCurrencyCode
        });
        return groups;
      }, {})
    )
  };
}
