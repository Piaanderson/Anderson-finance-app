import { prisma } from "@/server/db";
import {
  deriveNetWorthHistory,
  derivePropertyEquity,
  eightMonthWindowStart
} from "./accounts-experience";
import { summarizePositions } from "./position-summary";

export async function getAccountOverview(
  householdId: string,
  now = new Date()
) {
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
        createdAt: true,
        plaidItem: {
          select: {
            id: true,
            institutionName: true,
            status: true,
            lastSyncedAt: true,
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
          }
        },
        positionSnapshots: {
          orderBy: [{ effectiveAt: "desc" }, { observedAt: "desc" }],
          take: 1,
          select: {
            effectiveAt: true,
            observedAt: true,
            source: true
          }
        },
        transactions: {
          where: { householdId, removedAt: null },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 3,
          select: {
            id: true,
            name: true,
            merchantName: true,
            amount: true,
            isoCurrencyCode: true,
            unofficialCurrencyCode: true,
            date: true,
            pending: true
          }
        },
        _count: {
          select: {
            transactions: { where: { householdId, removedAt: null } }
          }
        }
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

  const historyStart = eightMonthWindowStart(now);
  const [historyBaselines, historyWindow] = await Promise.all([
    prisma.accountPositionSnapshot.findMany({
      where: {
        householdId,
        effectiveAt: { lt: historyStart },
        account: { householdId, isActive: true }
      },
      distinct: ["accountId"],
      orderBy: [
        { accountId: "asc" },
        { effectiveAt: "desc" },
        { observedAt: "desc" }
      ],
      select: {
        accountId: true,
        signedBalance: true,
        isoCurrencyCode: true,
        effectiveAt: true,
        observedAt: true
      }
    }),
    prisma.accountPositionSnapshot.findMany({
      where: {
        householdId,
        effectiveAt: { gte: historyStart, lte: now },
        account: { householdId, isActive: true }
      },
      orderBy: [{ effectiveAt: "asc" }, { observedAt: "asc" }],
      select: {
        accountId: true,
        signedBalance: true,
        isoCurrencyCode: true,
        effectiveAt: true,
        observedAt: true
      }
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
    plaidItemId: account.plaidItem?.id ?? null,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    currentBalance: account.currentBalance?.toFixed(2) ?? null,
    availableBalance: account.availableBalance?.toFixed(2) ?? null,
    currency: account.isoCurrencyCode,
    createdAt: account.createdAt,
    latestSnapshot: account.positionSnapshots[0] ?? null,
    recentActivity: account.transactions.map((transaction) => ({
      ...transaction,
      amount: transaction.amount.toFixed(2),
      displayAmount: transaction.amount.negated().toFixed(2)
    })),
    activityCount: account._count.transactions,
    connection: account.plaidItem
      ? {
          id: account.plaidItem.id,
          status: account.plaidItem.status,
          lastSyncedAt: account.plaidItem.lastSyncedAt,
          job: account.plaidItem.syncJobs[0] ?? null
        }
      : null
  }));

  const propertyGroups = Object.values(
    links.reduce<
      Record<
        string,
        {
          property: {
            id: string;
            name: string;
            currentBalance: string | null;
            currency: string | null;
          };
          debts: Array<{
            linkId: string;
            id: string;
            name: string;
            currentBalance: string | null;
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
            link.propertyAccount.currentBalance?.toFixed(2) ?? null,
          currency: link.propertyAccount.isoCurrencyCode
        },
        debts: []
      };
      groups[link.propertyAccountId].debts.push({
        linkId: link.id,
        id: link.debtAccount.id,
        name: link.debtAccount.name,
        currentBalance: link.debtAccount.currentBalance?.toFixed(2) ?? null,
        currency: link.debtAccount.isoCurrencyCode
      });
      return groups;
    }, {})
  ).map((group) => ({
    ...group,
    equity: derivePropertyEquity(group.property, group.debts)
  }));

  const positionSummary = summarizePositions(
    accounts.map((account) => ({
      id: account.id,
      classification: account.classification,
      currentBalance: account.currentBalance,
      isoCurrencyCode: account.isoCurrencyCode,
      isActive: true
    }))
  );

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
    positionSummary,
    propertyGroups,
    netWorthHistory: deriveNetWorthHistory(
      accounts.map((account) => account.id),
      [...historyBaselines, ...historyWindow],
      historyStart,
      now
    ),
    historyWindow: { start: historyStart, end: now }
  };
}
