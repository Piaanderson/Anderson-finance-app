import "server-only";
import { prisma } from "@/server/db";
import {
  buildTransferSuggestions,
  type TransferPolicyTransaction
} from "./transfer-suggestions";

export async function getHouseholdTransferSuggestions({
  householdId,
  limit = 100
}: {
  householdId: string;
  limit?: number;
}) {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId,
      removedAt: null,
      pending: false,
      account: { householdId }
    },
    select: {
      id: true,
      householdId: true,
      accountId: true,
      account: {
        select: {
          name: true,
          mask: true
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
      outgoingTransfer: {
        select: {
          incomingTransaction: { select: { removedAt: true } }
        }
      },
      incomingTransfer: {
        select: {
          outgoingTransaction: { select: { removedAt: true } }
        }
      }
    }
  });
  const transactions: TransferPolicyTransaction[] = rows.map((row) => ({
    id: row.id,
    householdId: row.householdId,
    accountId: row.accountId,
    accountName: row.account.name,
    accountMask: row.account.mask,
    name: row.name,
    merchantName: row.merchantName,
    bankDescription: row.bankDescription,
    paymentMemo: row.paymentMemo,
    referenceNumber: row.referenceNumber,
    paymentChannel: row.paymentChannel,
    transactionCode: row.transactionCode,
    checkNumber: row.checkNumber,
    amount: row.amount.toFixed(2),
    isoCurrencyCode: row.isoCurrencyCode,
    unofficialCurrencyCode: row.unofficialCurrencyCode,
    date: row.date,
    authorizedDate: row.authorizedDate,
    pending: row.pending,
    removedAt: row.removedAt,
    matched: Boolean(
      (row.outgoingTransfer &&
        row.outgoingTransfer.incomingTransaction.removedAt === null) ||
      (row.incomingTransfer &&
        row.incomingTransfer.outgoingTransaction.removedAt === null)
    )
  }));

  return buildTransferSuggestions({ householdId, transactions, limit });
}
