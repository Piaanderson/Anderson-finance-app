import { Prisma } from "@prisma/client";

export type SnapshotValue = {
  accountId: string;
  signedBalance: Prisma.Decimal.Value | null;
  isoCurrencyCode: string | null;
  effectiveAt: Date;
  observedAt: Date;
};

export type NetWorthHistoryPoint = {
  effectiveAt: Date;
  amount: string;
  currency: string;
};

export type NetWorthHistory =
  | {
      status: "available";
      points: NetWorthHistoryPoint[];
      currency: string;
    }
  | {
      status: "unavailable";
      points: [];
      reason: string;
    };

type PositionValue = {
  currentBalance: Prisma.Decimal.Value | null;
  currency: string | null;
};

export function derivePropertyEquity(
  property: PositionValue,
  debts: PositionValue[]
):
  | { status: "available"; amount: string; currency: string }
  | { status: "unavailable"; reason: string } {
  if (property.currentBalance === null || !property.currency) {
    return {
      status: "unavailable",
      reason: "Property value or currency is unavailable."
    };
  }
  if (
    debts.some(
      (debt) =>
        debt.currentBalance === null || debt.currency !== property.currency
    )
  ) {
    return {
      status: "unavailable",
      reason: "Linked balances are missing or use different currencies."
    };
  }

  const amount = debts.reduce(
    (total, debt) => total.plus(debt.currentBalance!),
    new Prisma.Decimal(property.currentBalance)
  );
  return {
    status: "available",
    amount: amount.toFixed(2),
    currency: property.currency
  };
}

export function deriveNetWorthHistory(
  activeAccountIds: string[],
  snapshots: SnapshotValue[],
  windowStart: Date,
  windowEnd: Date
): NetWorthHistory {
  if (activeAccountIds.length === 0) {
    return {
      status: "unavailable",
      points: [],
      reason: "Add an account before net-worth history can begin."
    };
  }

  const activeIds = new Set(activeAccountIds);
  const relevant = snapshots
    .filter(
      (snapshot) =>
        activeIds.has(snapshot.accountId) &&
        snapshot.effectiveAt.getTime() <= windowEnd.getTime()
    )
    .sort((left, right) => {
      const effective =
        left.effectiveAt.getTime() - right.effectiveAt.getTime();
      return (
        effective || left.observedAt.getTime() - right.observedAt.getTime()
      );
    });
  const state = new Map<
    string,
    { balance: Prisma.Decimal.Value | null; currency: string | null }
  >();

  for (const snapshot of relevant) {
    if (snapshot.effectiveAt.getTime() >= windowStart.getTime()) break;
    state.set(snapshot.accountId, {
      balance: snapshot.signedBalance,
      currency: snapshot.isoCurrencyCode
    });
  }

  const inWindow = relevant.filter(
    (snapshot) => snapshot.effectiveAt.getTime() >= windowStart.getTime()
  );
  const byEffectiveTime = new Map<number, SnapshotValue[]>();
  for (const snapshot of inWindow) {
    const time = snapshot.effectiveAt.getTime();
    const atTime = byEffectiveTime.get(time) ?? [];
    const priorIndex = atTime.findIndex(
      (candidate) => candidate.accountId === snapshot.accountId
    );
    if (priorIndex >= 0) {
      atTime[priorIndex] = snapshot;
    } else {
      atTime.push(snapshot);
    }
    byEffectiveTime.set(time, atTime);
  }

  const points: NetWorthHistoryPoint[] = [];
  for (const [effectiveTime, observations] of [...byEffectiveTime].sort(
    ([left], [right]) => left - right
  )) {
    for (const observation of observations) {
      state.set(observation.accountId, {
        balance: observation.signedBalance,
        currency: observation.isoCurrencyCode
      });
    }
    if (state.size !== activeAccountIds.length) continue;
    const values = activeAccountIds.map((accountId) => state.get(accountId)!);
    if (
      values.some((value) => value.balance === null || value.currency === null)
    ) {
      continue;
    }
    const currencies = new Set(values.map((value) => value.currency!));
    if (currencies.size !== 1) continue;
    const amount = values.reduce(
      (total, value) => total.plus(value.balance!),
      new Prisma.Decimal(0)
    );
    points.push({
      effectiveAt: new Date(effectiveTime),
      amount: amount.toFixed(2),
      currency: values[0]!.currency!
    });
  }

  const pointCurrencies = new Set(points.map((point) => point.currency));
  if (pointCurrencies.size > 1) {
    return {
      status: "unavailable",
      points: [],
      reason:
        "History spans multiple currencies. Currents does not apply an implicit exchange rate."
    };
  }
  if (points.length < 2) {
    return {
      status: "unavailable",
      points: [],
      reason:
        "Not enough complete, single-currency snapshot observations are available yet."
    };
  }

  return {
    status: "available",
    points,
    currency: points[0]!.currency
  };
}

export function eightMonthWindowStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 7, 1, 0, 0, 0, 0)
  );
}
