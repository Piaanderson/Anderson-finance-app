import { Prisma, type FinancialAccountClassification } from "@prisma/client";
import { prisma } from "@/server/db";
import { writePositionSnapshot } from "./position-snapshots";

export const manualClassifications = [
  "CASH",
  "INVESTED",
  "PROPERTY",
  "DEBT"
] as const satisfies readonly FinancialAccountClassification[];

export type ManualAccountInput = {
  name: string;
  classification: (typeof manualClassifications)[number];
  entryBalance: Prisma.Decimal.Value;
  isoCurrencyCode: string;
  effectiveAt: Date;
};

export class ManualAccountError extends Error {}

export async function withManualAccountTransactionRetry<T>(
  operation: () => Promise<T>
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ManualAccountError(
          "The property links changed in another session. Try again."
        );
      }
      throw error;
    }
  }
  throw new ManualAccountError(
    "The property links changed in another session. Try again."
  );
}

export function normalizeManualPosition(
  classification: ManualAccountInput["classification"],
  entryBalance: Prisma.Decimal.Value
) {
  const amount = new Prisma.Decimal(entryBalance);
  return (classification === "DEBT" ? amount.abs().negated() : amount).toFixed(
    2
  );
}

export async function createManualAccount(
  householdId: string,
  input: ManualAccountInput
) {
  const signedBalance = normalizeManualPosition(
    input.classification,
    input.entryBalance
  );

  return prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.create({
      data: {
        householdId,
        source: "MANUAL",
        classification: input.classification,
        name: input.name,
        currentBalance: signedBalance,
        isoCurrencyCode: input.isoCurrencyCode
      }
    });
    await writePositionSnapshot(tx, {
      householdId,
      accountId: account.id,
      signedBalance,
      isoCurrencyCode: input.isoCurrencyCode,
      effectiveAt: input.effectiveAt,
      source: "MANUAL"
    });
    return account;
  });
}

export async function updateManualAccount(
  householdId: string,
  accountId: string,
  input: ManualAccountInput
) {
  const signedBalance = normalizeManualPosition(
    input.classification,
    input.entryBalance
  );

  return prisma.$transaction(async (tx) => {
    const existing = await tx.financialAccount.findFirst({
      where: {
        id: accountId,
        householdId,
        source: "MANUAL",
        isActive: true
      },
      select: { id: true }
    });
    if (!existing) throw new ManualAccountError("Manual account not found.");

    const account = await tx.financialAccount.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        classification: input.classification
      }
    });
    await writePositionSnapshot(tx, {
      householdId,
      accountId: account.id,
      signedBalance,
      isoCurrencyCode: input.isoCurrencyCode,
      effectiveAt: input.effectiveAt,
      source: "MANUAL"
    });
    if (input.classification !== "PROPERTY") {
      await tx.propertyDebtLink.deleteMany({
        where: { householdId, propertyAccountId: account.id }
      });
    }
    if (input.classification !== "DEBT") {
      await tx.propertyDebtLink.deleteMany({
        where: { householdId, debtAccountId: account.id }
      });
    }
    return account;
  });
}

export async function archiveManualAccount(
  householdId: string,
  accountId: string
) {
  const result = await prisma.financialAccount.updateMany({
    where: {
      id: accountId,
      householdId,
      source: "MANUAL",
      isActive: true
    },
    data: { isActive: false, archivedAt: new Date() }
  });
  if (result.count !== 1) {
    throw new ManualAccountError("Manual account not found.");
  }
}

export async function classifyPlaidAccount(
  householdId: string,
  accountId: string,
  classification: (typeof manualClassifications)[number]
) {
  const result = await prisma.financialAccount.updateMany({
    where: {
      id: accountId,
      householdId,
      source: "PLAID",
      classification: "UNCLASSIFIED",
      isActive: true
    },
    data: { classification }
  });
  if (result.count !== 1) {
    throw new ManualAccountError("Connected account not found.");
  }
}

export async function linkPropertyDebt(
  householdId: string,
  propertyAccountId: string,
  debtAccountId: string
) {
  if (propertyAccountId === debtAccountId) {
    throw new ManualAccountError("An account cannot be linked to itself.");
  }

  return withManualAccountTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const [property, debt] = await Promise.all([
          tx.financialAccount.findFirst({
            where: {
              id: propertyAccountId,
              householdId,
              classification: "PROPERTY",
              isActive: true
            },
            select: { id: true }
          }),
          tx.financialAccount.findFirst({
            where: {
              id: debtAccountId,
              householdId,
              classification: "DEBT",
              isActive: true
            },
            select: { id: true }
          })
        ]);
        if (!property || !debt) {
          throw new ManualAccountError(
            "Choose an active property and debt from this household."
          );
        }
        const existingDebtLink = await tx.propertyDebtLink.findFirst({
          where: { debtAccountId: debt.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        });
        if (existingDebtLink?.propertyAccountId !== undefined) {
          if (existingDebtLink.propertyAccountId !== property.id) {
            throw new ManualAccountError(
              "This debt is already linked to another property. Unlink it before linking it again."
            );
          }
          return existingDebtLink;
        }
        return tx.propertyDebtLink.create({
          data: {
            householdId,
            propertyAccountId: property.id,
            debtAccountId: debt.id
          }
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

export async function unlinkPropertyDebt(householdId: string, linkId: string) {
  const result = await prisma.propertyDebtLink.deleteMany({
    where: { id: linkId, householdId }
  });
  if (result.count !== 1) {
    throw new ManualAccountError("Property and debt link not found.");
  }
}
