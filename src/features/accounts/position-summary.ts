import { Prisma, type FinancialAccountClassification } from "@prisma/client";
import { prisma } from "@/server/db";

export type PositionInput = {
  id: string;
  classification: FinancialAccountClassification;
  currentBalance: Prisma.Decimal.Value | null;
  isoCurrencyCode: string | null;
  isActive: boolean;
};

export type CurrencyPositionTotal = {
  currency: string;
  amount: string;
};

export type HouseholdPositionSummary = {
  accountCount: number;
  totals: CurrencyPositionTotal[];
  totalsByClassification: Record<
    FinancialAccountClassification,
    CurrencyPositionTotal[]
  >;
  missingBalanceAccountIds: string[];
  missingCurrencyAccountIds: string[];
  isComplete: boolean;
};

const classifications: FinancialAccountClassification[] = [
  "CASH",
  "INVESTED",
  "PROPERTY",
  "DEBT",
  "UNCLASSIFIED"
];

function add(
  totals: Map<string, Prisma.Decimal>,
  currency: string,
  amount: Prisma.Decimal.Value
) {
  totals.set(
    currency,
    (totals.get(currency) ?? new Prisma.Decimal(0)).plus(amount)
  );
}

function sortedTotals(
  totals: Map<string, Prisma.Decimal>
): CurrencyPositionTotal[] {
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
}

export function summarizePositions(
  positions: PositionInput[]
): HouseholdPositionSummary {
  const active = positions.filter((position) => position.isActive);
  const totals = new Map<string, Prisma.Decimal>();
  const classificationTotals = new Map<
    FinancialAccountClassification,
    Map<string, Prisma.Decimal>
  >(classifications.map((classification) => [classification, new Map()]));
  const missingBalanceAccountIds: string[] = [];
  const missingCurrencyAccountIds: string[] = [];

  for (const position of active) {
    if (position.currentBalance === null) {
      missingBalanceAccountIds.push(position.id);
      continue;
    }
    if (!position.isoCurrencyCode) {
      missingCurrencyAccountIds.push(position.id);
      continue;
    }
    add(totals, position.isoCurrencyCode, position.currentBalance);
    add(
      classificationTotals.get(position.classification)!,
      position.isoCurrencyCode,
      position.currentBalance
    );
  }

  return {
    accountCount: active.length,
    totals: sortedTotals(totals),
    totalsByClassification: Object.fromEntries(
      classifications.map((classification) => [
        classification,
        sortedTotals(classificationTotals.get(classification)!)
      ])
    ) as HouseholdPositionSummary["totalsByClassification"],
    missingBalanceAccountIds,
    missingCurrencyAccountIds,
    isComplete:
      missingBalanceAccountIds.length === 0 &&
      missingCurrencyAccountIds.length === 0
  };
}

export async function getHouseholdPositionSummary(householdId: string) {
  const accounts = await prisma.financialAccount.findMany({
    where: { householdId, isActive: true },
    select: {
      id: true,
      classification: true,
      currentBalance: true,
      isoCurrencyCode: true,
      isActive: true
    }
  });

  return summarizePositions(accounts);
}
