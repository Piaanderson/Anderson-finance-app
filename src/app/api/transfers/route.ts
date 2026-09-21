import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  evaluateTransferPair,
  type TransferPolicyTransaction
} from "@/features/transactions/transfer-suggestions";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const matchRequest = z.object({
  outgoingTransactionId: z.string().min(1),
  incomingTransactionId: z.string().min(1)
});

export async function POST(request: Request) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = matchRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transfer legs" },
      { status: 400 }
    );
  }
  const { outgoingTransactionId, incomingTransactionId } = parsed.data;
  if (outgoingTransactionId === incomingTransactionId) {
    return NextResponse.json(
      { error: "A transaction cannot match itself." },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.transaction.findMany({
          where: {
            id: { in: [outgoingTransactionId, incomingTransactionId] },
            householdId: owner.householdId,
            account: { householdId: owner.householdId }
          },
          select: {
            id: true,
            householdId: true,
            accountId: true,
            account: { select: { name: true, mask: true } },
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
                id: true,
                incomingTransaction: { select: { removedAt: true } }
              }
            },
            incomingTransfer: {
              select: {
                id: true,
                outgoingTransaction: { select: { removedAt: true } }
              }
            }
          }
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        const outgoingRow = byId.get(outgoingTransactionId);
        const incomingRow = byId.get(incomingTransactionId);
        if (!outgoingRow || !incomingRow) {
          return { kind: "not-found" as const };
        }
        const orphanMatchIds = rows.flatMap((row) => [
          ...(row.outgoingTransfer?.incomingTransaction.removedAt
            ? [row.outgoingTransfer.id]
            : []),
          ...(row.incomingTransfer?.outgoingTransaction.removedAt
            ? [row.incomingTransfer.id]
            : [])
        ]);
        if (orphanMatchIds.length > 0) {
          await tx.transferMatch.deleteMany({
            where: {
              householdId: owner.householdId,
              id: { in: orphanMatchIds }
            }
          });
        }
        const policyTransaction = (
          row: typeof outgoingRow
        ): TransferPolicyTransaction => ({
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
        });
        const eligibility = evaluateTransferPair(
          policyTransaction(outgoingRow),
          policyTransaction(incomingRow)
        );
        if (!eligibility.eligible) {
          const conflict = eligibility.issues.includes(
            "One or both transactions are already matched."
          );
          return {
            kind: conflict ? ("conflict" as const) : ("invalid" as const),
            issues: eligibility.issues
          };
        }
        const match = await tx.transferMatch.create({
          data: {
            householdId: owner.householdId,
            outgoingTransactionId,
            incomingTransactionId
          },
          select: { id: true }
        });
        return { kind: "created" as const, id: match.id };
      },
      { isolationLevel: "ReadCommitted" }
    );

    if (result.kind === "not-found") {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          error: "One or both transactions are already matched.",
          code: "TRANSFER_MATCH_CONFLICT"
        },
        { status: 409 }
      );
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        {
          error: "These transactions cannot be tied as a transfer.",
          code: "TRANSFER_NOT_ELIGIBLE",
          issues: result.issues
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        {
          error:
            "One or both transactions were matched by another request. Refresh and review the remaining suggestions.",
          code: "TRANSFER_MATCH_CONFLICT"
        },
        { status: 409 }
      );
    }
    throw error;
  }
}
