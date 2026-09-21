export type MovementDirection = "INFLOW" | "OUTFLOW" | "NEUTRAL";

export type MovementCurrency =
  | { kind: "ISO"; code: string }
  | { kind: "UNOFFICIAL"; code: string }
  | { kind: "UNKNOWN"; code: null };

export type MovementAmount = {
  value: string;
  currency: MovementCurrency;
};

export type MovementCategory = {
  id: string;
  name: string;
  section: string;
  archived: boolean;
};

export type MovementLeg = {
  transactionId: string;
  role: "OUTGOING" | "INCOMING" | "SINGLE";
  direction: MovementDirection;
  account: {
    id: string;
    name: string;
    mask: string | null;
    active: boolean;
  };
  postedDate: string;
  authorizedDate: string | null;
  effectiveDate: string;
  pending: boolean;
  amount: MovementAmount;
  plaidAmount: string;
  name: string;
  merchantName: string | null;
  bankDescription: string | null;
  paymentMemo: string | null;
  referenceNumber: string | null;
  paymentChannel: string | null;
  transactionCode: string | null;
  checkNumber: string | null;
};

type MovementBase = {
  id: string;
  canonicalDate: string;
  description: string;
  pending: boolean;
  amounts: MovementAmount[];
};

export type TransactionMovement = MovementBase & {
  kind: "TRANSACTION";
  direction: MovementDirection;
  category: MovementCategory | null;
  legs: [MovementLeg];
};

export type TransferMovement = MovementBase & {
  kind: "TRANSFER";
  direction: "INTERNAL";
  category: null;
  matchId: string;
  legs: [MovementLeg, MovementLeg];
};

export type HouseholdMovement = TransactionMovement | TransferMovement;

export type MovementSourceTransaction = {
  id: string;
  householdId: string;
  accountId: string;
  account: {
    id: string;
    householdId: string;
    name: string;
    mask: string | null;
    isActive: boolean;
  };
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
  category: {
    id: string;
    householdId: string;
    name: string;
    section: string;
    archivedAt: Date | null;
  } | null;
};

export type MovementSourceMatch = {
  id: string;
  householdId: string;
  outgoingTransactionId: string;
  incomingTransactionId: string;
};

type MovementTotal = {
  currency: MovementCurrency;
  income: string;
  spending: string;
};

type CategorySpending = {
  categoryId: string;
  currency: MovementCurrency;
  spending: string;
};

function text(...values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? "Transaction";
}

function currencyFor(transaction: MovementSourceTransaction): MovementCurrency {
  if (transaction.isoCurrencyCode) {
    return { kind: "ISO", code: transaction.isoCurrencyCode };
  }
  if (transaction.unofficialCurrencyCode) {
    return { kind: "UNOFFICIAL", code: transaction.unofficialCurrencyCode };
  }
  return { kind: "UNKNOWN", code: null };
}

function currencyKey(currency: MovementCurrency) {
  return `${currency.kind}:${currency.code ?? ""}`;
}

function minorUnits(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid fixed-point movement amount: ${value}`);
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

function absoluteAmount(value: string) {
  const amount = minorUnits(value);
  return decimalAmount(amount < 0n ? -amount : amount);
}

function directionFor(value: string): MovementDirection {
  const amount = minorUnits(value);
  if (amount > 0n) return "OUTFLOW";
  if (amount < 0n) return "INFLOW";
  return "NEUTRAL";
}

function isoDate(value: Date) {
  return value.toISOString();
}

function effectiveDate(transaction: MovementSourceTransaction) {
  return transaction.authorizedDate ?? transaction.date;
}

function legFor(
  transaction: MovementSourceTransaction,
  role: MovementLeg["role"]
): MovementLeg {
  return {
    transactionId: transaction.id,
    role,
    direction: directionFor(transaction.amount),
    account: {
      id: transaction.account.id,
      name: transaction.account.name,
      mask: transaction.account.mask,
      active: transaction.account.isActive
    },
    postedDate: isoDate(transaction.date),
    authorizedDate: transaction.authorizedDate
      ? isoDate(transaction.authorizedDate)
      : null,
    effectiveDate: isoDate(effectiveDate(transaction)),
    pending: transaction.pending,
    amount: {
      value: absoluteAmount(transaction.amount),
      currency: currencyFor(transaction)
    },
    plaidAmount: decimalAmount(minorUnits(transaction.amount)),
    name: transaction.name,
    merchantName: transaction.merchantName,
    bankDescription: transaction.bankDescription,
    paymentMemo: transaction.paymentMemo,
    referenceNumber: transaction.referenceNumber,
    paymentChannel: transaction.paymentChannel,
    transactionCode: transaction.transactionCode,
    checkNumber: transaction.checkNumber
  };
}

function categoryFor(
  transaction: MovementSourceTransaction,
  householdId: string
): MovementCategory | null {
  if (
    !transaction.category ||
    transaction.category.householdId !== householdId
  ) {
    return null;
  }
  return {
    id: transaction.category.id,
    name: transaction.category.name,
    section: transaction.category.section,
    archived: transaction.category.archivedAt !== null
  };
}

function transferAmounts(outgoing: MovementLeg, incoming: MovementLeg) {
  const outgoingKey = currencyKey(outgoing.amount.currency);
  if (
    outgoingKey === currencyKey(incoming.amount.currency) &&
    outgoing.amount.value === incoming.amount.value
  ) {
    return [outgoing.amount];
  }
  return [outgoing.amount, incoming.amount];
}

function canonicalTransferDescription(
  outgoing: MovementSourceTransaction,
  incoming: MovementSourceTransaction
) {
  return text(
    outgoing.merchantName,
    outgoing.bankDescription,
    outgoing.name,
    incoming.merchantName,
    incoming.bankDescription,
    incoming.name
  );
}

export function buildHouseholdMovements({
  householdId,
  transactions,
  matches
}: {
  householdId: string;
  transactions: MovementSourceTransaction[];
  matches: MovementSourceMatch[];
}) {
  const ownedTransactions = transactions
    .filter(
      (transaction) =>
        transaction.householdId === householdId &&
        transaction.account.householdId === householdId &&
        transaction.accountId === transaction.account.id &&
        transaction.removedAt === null
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const transactionById = new Map(
    ownedTransactions.map((transaction) => [transaction.id, transaction])
  );
  const consumed = new Set<string>();
  const movements: HouseholdMovement[] = [];

  for (const match of [...matches].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (match.householdId !== householdId) continue;
    const outgoing = transactionById.get(match.outgoingTransactionId);
    const incoming = transactionById.get(match.incomingTransactionId);
    if (
      !outgoing ||
      !incoming ||
      outgoing.id === incoming.id ||
      consumed.has(outgoing.id) ||
      consumed.has(incoming.id)
    ) {
      continue;
    }
    const outgoingLeg = legFor(outgoing, "OUTGOING");
    const incomingLeg = legFor(incoming, "INCOMING");
    movements.push({
      id: `transfer:${outgoing.id}:${incoming.id}`,
      kind: "TRANSFER",
      direction: "INTERNAL",
      matchId: match.id,
      canonicalDate: isoDate(effectiveDate(outgoing)),
      description: canonicalTransferDescription(outgoing, incoming),
      pending: outgoing.pending || incoming.pending,
      category: null,
      amounts: transferAmounts(outgoingLeg, incomingLeg),
      legs: [outgoingLeg, incomingLeg]
    });
    consumed.add(outgoing.id);
    consumed.add(incoming.id);
  }

  for (const transaction of ownedTransactions) {
    if (consumed.has(transaction.id)) continue;
    const leg = legFor(transaction, "SINGLE");
    movements.push({
      id: `transaction:${transaction.id}`,
      kind: "TRANSACTION",
      direction: leg.direction,
      canonicalDate: leg.effectiveDate,
      description: text(
        transaction.merchantName,
        transaction.bankDescription,
        transaction.name
      ),
      pending: transaction.pending,
      category: categoryFor(transaction, householdId),
      amounts: [leg.amount],
      legs: [leg]
    });
  }

  return movements.sort((left, right) => {
    const dateOrder = right.canonicalDate.localeCompare(left.canonicalDate);
    return dateOrder || left.id.localeCompare(right.id);
  });
}

export function summarizeMovements(
  movements: HouseholdMovement[]
): MovementTotal[] {
  const totals = new Map<
    string,
    { currency: MovementCurrency; income: bigint; spending: bigint }
  >();
  for (const movement of movements) {
    if (movement.kind === "TRANSFER") continue;
    const [leg] = movement.legs;
    const key = currencyKey(leg.amount.currency);
    const total = totals.get(key) ?? {
      currency: leg.amount.currency,
      income: 0n,
      spending: 0n
    };
    const amount = minorUnits(leg.amount.value);
    if (leg.direction === "OUTFLOW") total.spending += amount;
    if (leg.direction === "INFLOW") total.income += amount;
    totals.set(key, total);
  }
  return [...totals.values()]
    .sort((left, right) =>
      currencyKey(left.currency).localeCompare(currencyKey(right.currency))
    )
    .map((total) => ({
      currency: total.currency,
      income: decimalAmount(total.income),
      spending: decimalAmount(total.spending)
    }));
}

export function summarizeCategorySpending(
  movements: HouseholdMovement[]
): CategorySpending[] {
  const totals = new Map<
    string,
    { categoryId: string; currency: MovementCurrency; spending: bigint }
  >();
  for (const movement of movements) {
    if (
      movement.kind !== "TRANSACTION" ||
      movement.direction !== "OUTFLOW" ||
      !movement.category
    ) {
      continue;
    }
    const [leg] = movement.legs;
    const key = `${movement.category.id}:${currencyKey(leg.amount.currency)}`;
    const total = totals.get(key) ?? {
      categoryId: movement.category.id,
      currency: leg.amount.currency,
      spending: 0n
    };
    total.spending += minorUnits(leg.amount.value);
    totals.set(key, total);
  }
  return [...totals.values()]
    .sort((left, right) => {
      const categoryOrder = left.categoryId.localeCompare(right.categoryId);
      return (
        categoryOrder ||
        currencyKey(left.currency).localeCompare(currencyKey(right.currency))
      );
    })
    .map((total) => ({
      categoryId: total.categoryId,
      currency: total.currency,
      spending: decimalAmount(total.spending)
    }));
}

export function movementMatchesQuery(
  movement: HouseholdMovement,
  query: string
) {
  const needle = query.trim().toLocaleLowerCase("en-US");
  if (!needle) return true;
  const values = [
    movement.description,
    movement.category?.name,
    ...movement.amounts.flatMap((amount) => [
      amount.value,
      amount.currency.code
    ]),
    ...movement.legs.flatMap((leg) => [
      leg.account.name,
      leg.account.mask,
      leg.name,
      leg.merchantName,
      leg.bankDescription,
      leg.paymentMemo,
      leg.referenceNumber,
      leg.paymentChannel,
      leg.transactionCode,
      leg.checkNumber
    ])
  ];
  return values.some((value) =>
    value?.toLocaleLowerCase("en-US").includes(needle)
  );
}
