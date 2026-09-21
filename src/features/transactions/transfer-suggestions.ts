export const TRANSFER_DATE_WINDOW_DAYS = 7;
export const TRANSFER_AMBIGUITY_SCORE_DISTANCE = 10;

export type TransferCurrencyIdentity =
  { kind: "ISO"; code: string } | { kind: "UNOFFICIAL"; code: string };

export type TransferPolicyTransaction = {
  id: string;
  householdId: string;
  accountId: string;
  accountName: string;
  accountMask: string | null;
  name: string;
  merchantName: string | null;
  bankDescription: string | null;
  paymentMemo: string | null;
  referenceNumber: string | null;
  paymentChannel: string | null;
  transactionCode: string | null;
  checkNumber: string | null;
  amount: string;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  date: Date;
  authorizedDate: Date | null;
  pending: boolean;
  removedAt: Date | null;
  matched: boolean;
};

export type TransferSuggestionLeg = {
  transactionId: string;
  account: {
    id: string;
    name: string;
    mask: string | null;
  };
  description: string;
  name: string;
  merchantName: string | null;
  bankDescription: string | null;
  paymentMemo: string | null;
  referenceNumber: string | null;
  paymentChannel: string | null;
  transactionCode: string | null;
  checkNumber: string | null;
  signedAmount: string;
  absoluteAmount: string;
  currency: TransferCurrencyIdentity;
  postedDate: string;
  authorizedDate: string | null;
  effectiveDate: string;
};

export type TransferSuggestionCandidate = {
  id: string;
  outgoing: TransferSuggestionLeg;
  incoming: TransferSuggestionLeg;
  score: number;
  dateDistanceDays: number;
  reasons: string[];
  requiresConfirmation: true;
};

export type TransferSuggestion = {
  id: string;
  outgoingTransactionId: string;
  candidates: TransferSuggestionCandidate[];
  ambiguous: boolean;
  ambiguityReason: string | null;
};

export type TransferEligibility =
  | {
      eligible: true;
      amountMinorUnits: bigint;
      currency: TransferCurrencyIdentity;
      dateDistanceDays: number;
      descriptionEvidence: number;
    }
  | { eligible: false; issues: string[] };

export function fixedPointMinorUnits(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid fixed-point amount: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -magnitude : magnitude;
}

function decimalAmount(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  return `${sign}${magnitude / 100n}.${(magnitude % 100n)
    .toString()
    .padStart(2, "0")}`;
}

function currencyIdentity(
  transaction: TransferPolicyTransaction
): TransferCurrencyIdentity | null {
  const iso = transaction.isoCurrencyCode?.trim().toUpperCase() || null;
  const unofficial =
    transaction.unofficialCurrencyCode?.trim().toUpperCase() || null;
  if (iso && !unofficial) return { kind: "ISO", code: iso };
  if (unofficial && !iso) return { kind: "UNOFFICIAL", code: unofficial };
  return null;
}

function currencyKey(currency: TransferCurrencyIdentity) {
  return `${currency.kind}:${currency.code}`;
}

export function transferEffectiveDate(transaction: TransferPolicyTransaction) {
  return transaction.authorizedDate ?? transaction.date;
}

function calendarDay(value: Date) {
  if (!Number.isFinite(value.getTime())) return null;
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  );
}

function dateDistanceDays(
  left: TransferPolicyTransaction,
  right: TransferPolicyTransaction
) {
  const leftDay = calendarDay(transferEffectiveDate(left));
  const rightDay = calendarDay(transferEffectiveDate(right));
  if (leftDay === null || rightDay === null) return null;
  return Math.abs(leftDay - rightDay) / 86_400_000;
}

const TRANSFER_WORDS =
  /\b(ach|autopay|epay|paymt|payment|pmt|transfer|xfer)\b/i;

function hasTransferDescription(transaction: TransferPolicyTransaction) {
  return TRANSFER_WORDS.test(
    [
      transaction.name,
      transaction.merchantName,
      transaction.bankDescription,
      transaction.paymentMemo,
      transaction.transactionCode
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function firstDescription(transaction: TransferPolicyTransaction) {
  return (
    [transaction.merchantName, transaction.bankDescription, transaction.name]
      .find((value) => value?.trim())
      ?.trim() ?? "Transaction"
  );
}

export function evaluateTransferPair(
  outgoing: TransferPolicyTransaction,
  incoming: TransferPolicyTransaction
): TransferEligibility {
  const issues: string[] = [];
  let outgoingAmount: bigint | null = null;
  let incomingAmount: bigint | null = null;

  try {
    outgoingAmount = fixedPointMinorUnits(outgoing.amount);
    incomingAmount = fixedPointMinorUnits(incoming.amount);
  } catch {
    issues.push("Both legs must have valid fixed-point amounts.");
  }

  if (
    outgoing.householdId !== incoming.householdId ||
    outgoing.householdId.trim() === ""
  ) {
    issues.push("Both legs must belong to the same household.");
  }
  if (outgoing.id === incoming.id) {
    issues.push("A transaction cannot match itself.");
  }
  if (outgoing.accountId === incoming.accountId) {
    issues.push("Transfer legs must use different accounts.");
  }
  if (outgoing.removedAt || incoming.removedAt) {
    issues.push("Removed transactions cannot be matched.");
  }
  if (outgoing.matched || incoming.matched) {
    issues.push("One or both transactions are already matched.");
  }
  if (outgoing.pending || incoming.pending) {
    issues.push("Pending transactions must post before they can be matched.");
  }
  if (
    outgoingAmount !== null &&
    incomingAmount !== null &&
    (outgoingAmount <= 0n || incomingAmount >= 0n)
  ) {
    issues.push(
      "The outgoing leg must be positive and the incoming leg negative."
    );
  }
  if (
    outgoingAmount !== null &&
    incomingAmount !== null &&
    (outgoingAmount === 0n || outgoingAmount !== -incomingAmount)
  ) {
    issues.push("Transfer legs must have exactly equal absolute amounts.");
  }

  const outgoingCurrency = currencyIdentity(outgoing);
  const incomingCurrency = currencyIdentity(incoming);
  if (!outgoingCurrency || !incomingCurrency) {
    issues.push("Both legs must have one known currency identity.");
  } else if (currencyKey(outgoingCurrency) !== currencyKey(incomingCurrency)) {
    issues.push("Transfer legs must use the same currency identity.");
  }

  const distance = dateDistanceDays(outgoing, incoming);
  if (distance === null) {
    issues.push("Both legs must have valid effective dates.");
  } else if (distance > TRANSFER_DATE_WINDOW_DAYS) {
    issues.push(
      `Transfer legs must be within ${TRANSFER_DATE_WINDOW_DAYS} calendar days.`
    );
  }

  if (issues.length > 0) return { eligible: false, issues };
  const descriptionEvidence =
    Number(hasTransferDescription(outgoing)) +
    Number(hasTransferDescription(incoming));
  return {
    eligible: true,
    amountMinorUnits: outgoingAmount!,
    currency: outgoingCurrency!,
    dateDistanceDays: distance!,
    descriptionEvidence
  };
}

function suggestionLeg(
  transaction: TransferPolicyTransaction,
  currency: TransferCurrencyIdentity
): TransferSuggestionLeg {
  const amount = fixedPointMinorUnits(transaction.amount);
  return {
    transactionId: transaction.id,
    account: {
      id: transaction.accountId,
      name: transaction.accountName,
      mask: transaction.accountMask
    },
    description: firstDescription(transaction),
    name: transaction.name,
    merchantName: transaction.merchantName,
    bankDescription: transaction.bankDescription,
    paymentMemo: transaction.paymentMemo,
    referenceNumber: transaction.referenceNumber,
    paymentChannel: transaction.paymentChannel,
    transactionCode: transaction.transactionCode,
    checkNumber: transaction.checkNumber,
    signedAmount: decimalAmount(amount),
    absoluteAmount: decimalAmount(amount < 0n ? -amount : amount),
    currency,
    postedDate: transaction.date.toISOString(),
    authorizedDate: transaction.authorizedDate?.toISOString() ?? null,
    effectiveDate: transferEffectiveDate(transaction).toISOString()
  };
}

function candidateFor(
  outgoing: TransferPolicyTransaction,
  incoming: TransferPolicyTransaction,
  eligibility: Extract<TransferEligibility, { eligible: true }>
): TransferSuggestionCandidate {
  const dateReason =
    eligibility.dateDistanceDays === 0
      ? "Effective dates are the same day."
      : `Effective dates are ${eligibility.dateDistanceDays} day${
          eligibility.dateDistanceDays === 1 ? "" : "s"
        } apart.`;
  const reasons = [
    `Exact ${decimalAmount(eligibility.amountMinorUnits)} ${
      eligibility.currency.code
    } amount.`,
    `Different accounts: ${outgoing.accountName} → ${incoming.accountName}.`,
    dateReason
  ];
  if (eligibility.descriptionEvidence === 1) {
    reasons.push("One bank description uses transfer-related wording.");
  }
  if (eligibility.descriptionEvidence === 2) {
    reasons.push("Both bank descriptions use transfer-related wording.");
  }
  return {
    id: `${outgoing.id}:${incoming.id}`,
    outgoing: suggestionLeg(outgoing, eligibility.currency),
    incoming: suggestionLeg(incoming, eligibility.currency),
    score:
      (TRANSFER_DATE_WINDOW_DAYS - eligibility.dateDistanceDays) * 10 +
      eligibility.descriptionEvidence * 3,
    dateDistanceDays: eligibility.dateDistanceDays,
    reasons,
    requiresConfirmation: true
  };
}

function baseBucket(transaction: TransferPolicyTransaction) {
  if (
    transaction.pending ||
    transaction.removedAt ||
    transaction.matched ||
    !Number.isFinite(transferEffectiveDate(transaction).getTime())
  ) {
    return null;
  }
  const currency = currencyIdentity(transaction);
  if (!currency) return null;
  try {
    const amount = fixedPointMinorUnits(transaction.amount);
    if (amount === 0n) return null;
    const magnitude = amount < 0n ? -amount : amount;
    return {
      key: `${currencyKey(currency)}:${magnitude}`,
      amount
    };
  } catch {
    return null;
  }
}

export function buildTransferSuggestions({
  householdId,
  transactions,
  limit = 100
}: {
  householdId: string;
  transactions: TransferPolicyTransaction[];
  limit?: number;
}) {
  const owned = transactions
    .filter((transaction) => transaction.householdId === householdId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const outgoing: TransferPolicyTransaction[] = [];
  const incomingBuckets = new Map<string, TransferPolicyTransaction[]>();

  for (const transaction of owned) {
    const bucket = baseBucket(transaction);
    if (!bucket) continue;
    if (bucket.amount > 0n) {
      outgoing.push(transaction);
      continue;
    }
    const entries = incomingBuckets.get(bucket.key) ?? [];
    entries.push(transaction);
    incomingBuckets.set(bucket.key, entries);
  }

  const suggestions: TransferSuggestion[] = [];
  for (const outgoingTransaction of outgoing) {
    const bucket = baseBucket(outgoingTransaction);
    if (!bucket) continue;
    const candidates = (incomingBuckets.get(bucket.key) ?? [])
      .map((incomingTransaction) => {
        const eligibility = evaluateTransferPair(
          outgoingTransaction,
          incomingTransaction
        );
        return eligibility.eligible
          ? candidateFor(outgoingTransaction, incomingTransaction, eligibility)
          : null;
      })
      .filter(
        (candidate): candidate is TransferSuggestionCandidate =>
          candidate !== null
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.dateDistanceDays - right.dateDistanceDays ||
          left.incoming.effectiveDate.localeCompare(
            right.incoming.effectiveDate
          ) ||
          left.incoming.transactionId.localeCompare(
            right.incoming.transactionId
          )
      );
    if (candidates.length === 0) continue;
    const ambiguous =
      candidates.length > 1 &&
      candidates[0].score - candidates[1].score <=
        TRANSFER_AMBIGUITY_SCORE_DISTANCE;
    suggestions.push({
      id: `suggestion:${outgoingTransaction.id}`,
      outgoingTransactionId: outgoingTransaction.id,
      candidates,
      ambiguous,
      ambiguityReason: ambiguous
        ? "More than one candidate is similarly plausible. Inspect and choose the correct incoming leg."
        : null
    });
  }

  return suggestions
    .sort(
      (left, right) =>
        right.candidates[0].score - left.candidates[0].score ||
        right.candidates[0].outgoing.effectiveDate.localeCompare(
          left.candidates[0].outgoing.effectiveDate
        ) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, Math.max(0, Math.min(limit, 500)));
}
