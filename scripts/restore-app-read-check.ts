async function main() {
  const restoreDatabaseUrl = process.env.RESTORE_DRILL_DATABASE_URL;

  if (!restoreDatabaseUrl) {
    throw new Error("RESTORE_DRILL_DATABASE_URL is required.");
  }

  const parsedUrl = new URL(restoreDatabaseUrl);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");

  if (
    !allowedHosts.has(parsedUrl.hostname) ||
    databaseName !== "currents_restore"
  ) {
    throw new Error(
      "Restore read checks may only target the local currents_restore database."
    );
  }

  process.env.DATABASE_URL = restoreDatabaseUrl;

  const { prisma } = await import("@/server/db");

  try {
    const households = await prisma.household.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });

    if (households.length === 0) {
      throw new Error("The restored database has no household to read.");
    }

    let accountCount = 0;
    let connectionCount = 0;
    let transactionCount = 0;
    let snapshotCount = 0;
    let categoryCount = 0;
    let merchantRuleCount = 0;
    let budgetMonthCount = 0;
    let budgetAllocationCount = 0;
    let transferMatchCount = 0;

    for (const { id: householdId } of households) {
      const [items, accounts, transactions, categories, budgets, transfers] =
        await Promise.all([
          prisma.plaidItem.findMany({
            where: { householdId, status: { not: "REMOVED" } },
            select: {
              id: true,
              _count: {
                select: { accounts: { where: { householdId, isActive: true } } }
              }
            }
          }),
          prisma.financialAccount.findMany({
            where: { householdId, isActive: true },
            select: {
              id: true,
              positionSnapshots: {
                take: 1,
                orderBy: [{ effectiveAt: "desc" }, { observedAt: "desc" }],
                select: { id: true }
              }
            }
          }),
          prisma.transaction.findMany({
            where: {
              householdId,
              removedAt: null,
              account: { householdId }
            },
            select: {
              id: true,
              account: { select: { id: true } },
              category: { select: { id: true } }
            }
          }),
          prisma.category.findMany({
            where: { householdId },
            select: {
              id: true,
              rules: { select: { id: true } }
            }
          }),
          prisma.budgetMonth.findMany({
            where: { householdId },
            select: {
              id: true,
              allocations: {
                select: {
                  id: true,
                  category: { select: { id: true } },
                  destinationAccount: { select: { id: true } }
                }
              }
            }
          }),
          prisma.transferMatch.findMany({
            where: { householdId },
            select: {
              id: true,
              outgoingTransaction: { select: { id: true } },
              incomingTransaction: { select: { id: true } }
            }
          })
        ]);

      connectionCount += items.length;
      accountCount += accounts.length;
      snapshotCount += accounts.reduce(
        (count, account) => count + account.positionSnapshots.length,
        0
      );
      transactionCount += transactions.length;
      categoryCount += categories.length;
      merchantRuleCount += categories.reduce(
        (count, category) => count + category.rules.length,
        0
      );
      budgetMonthCount += budgets.length;
      budgetAllocationCount += budgets.reduce(
        (count, budget) => count + budget.allocations.length,
        0
      );
      transferMatchCount += transfers.length;
    }

    console.log(
      JSON.stringify({
        ok: true,
        households: households.length,
        connections: connectionCount,
        accounts: accountCount,
        latestSnapshotsRead: snapshotCount,
        transactions: transactionCount,
        transferMatches: transferMatchCount,
        categories: categoryCount,
        merchantRules: merchantRuleCount,
        budgetMonths: budgetMonthCount,
        budgetAllocations: budgetAllocationCount
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
