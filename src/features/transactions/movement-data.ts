import "server-only";
import { prisma } from "@/server/db";
import {
  buildHouseholdMovements,
  movementMatchesQuery,
  summarizeMovements,
  type MovementSourceTransaction
} from "./movements";

type MovementReadOptions = {
  householdId: string;
  from?: Date;
  to?: Date;
  query?: string;
  limit?: number;
};

export async function getHouseholdMovements({
  householdId,
  from,
  to,
  query = "",
  limit
}: MovementReadOptions) {
  const [rows, matches] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        householdId,
        removedAt: null,
        account: { householdId }
      },
      select: {
        id: true,
        householdId: true,
        accountId: true,
        account: {
          select: {
            id: true,
            householdId: true,
            name: true,
            mask: true,
            isActive: true
          }
        },
        name: true,
        merchantName: true,
        bankDescription: true,
        paymentMemo: true,
        referenceNumber: true,
        paymentChannel: true,
        transactionCode: true,
        checkNumber: true,
        amount: true,
        isoCurrencyCode: true,
        unofficialCurrencyCode: true,
        date: true,
        authorizedDate: true,
        pending: true,
        removedAt: true,
        category: {
          select: {
            id: true,
            householdId: true,
            name: true,
            section: true,
            archivedAt: true
          }
        }
      }
    }),
    prisma.transferMatch.findMany({
      where: {
        householdId,
        outgoingTransaction: {
          householdId,
          removedAt: null,
          account: { householdId }
        },
        incomingTransaction: {
          householdId,
          removedAt: null,
          account: { householdId }
        }
      },
      select: {
        id: true,
        householdId: true,
        outgoingTransactionId: true,
        incomingTransactionId: true
      }
    })
  ]);

  const transactions: MovementSourceTransaction[] = rows.map((row) => ({
    ...row,
    amount: row.amount.toFixed(2)
  }));
  const movements = buildHouseholdMovements({
    householdId,
    transactions,
    matches
  }).filter((movement) => {
    const date = new Date(movement.canonicalDate);
    return (
      (!from || date >= from) &&
      (!to || date < to) &&
      movementMatchesQuery(movement, query)
    );
  });
  if (limit === undefined) return movements;
  return movements.slice(0, Math.max(0, Math.min(limit, 500)));
}

export async function getHouseholdCashFlow(
  options: Omit<MovementReadOptions, "query" | "limit">
) {
  return summarizeMovements(await getHouseholdMovements(options));
}
