import type { FinancialAccountClassification } from "@prisma/client";

export function classificationForPlaidType(
  type: string
): FinancialAccountClassification {
  switch (type.toLowerCase()) {
    case "depository":
      return "CASH";
    case "investment":
      return "INVESTED";
    case "credit":
    case "loan":
      return "DEBT";
    default:
      return "UNCLASSIFIED";
  }
}

export function positionBalanceFromPlaid(
  classification: FinancialAccountClassification,
  currentBalance: number | null
) {
  if (currentBalance === null) return null;
  return classification === "DEBT" ? -currentBalance : currentBalance;
}

export function classificationLabel(
  classification: FinancialAccountClassification
) {
  switch (classification) {
    case "CASH":
      return "Cash";
    case "INVESTED":
      return "Invested";
    case "PROPERTY":
      return "Property";
    case "DEBT":
      return "Debt";
    case "UNCLASSIFIED":
      return "Needs classification";
  }
}
