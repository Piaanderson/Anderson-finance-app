export type MonthPaceState = "in-progress" | "complete" | "not-started";

export type MonthPace = {
  state: MonthPaceState;
  day: number;
  daysInMonth: number;
  elapsedDays: number;
  label: string;
  periodStart: Date;
  periodEnd: Date;
};

export type MonthComparison = {
  month: Date;
  periodStart: Date;
  periodEnd: Date;
  elapsedDays: number;
  available: boolean;
  label: string;
};

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

const periodDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

export function parseMonthKey(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 1900 || year > 2200) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export function monthLabel(value: Date) {
  return monthName.format(value);
}

export function shiftMonth(value: Date, offset: number) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1)
  );
}

export function currentUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function daysInUtcMonth(month: Date) {
  return new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

function ordinalMonth(month: Date) {
  return month.getUTCFullYear() * 12 + month.getUTCMonth();
}

export function getMonthPace(month: Date, now: Date): MonthPace {
  const daysInMonth = daysInUtcMonth(month);
  const selected = ordinalMonth(month);
  const current = ordinalMonth(now);
  const state: MonthPaceState =
    selected < current
      ? "complete"
      : selected > current
        ? "not-started"
        : "in-progress";
  const day =
    state === "complete"
      ? daysInMonth
      : state === "not-started"
        ? 0
        : Math.min(now.getUTCDate(), daysInMonth);
  const periodStart = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)
  );
  const periodEnd =
    state === "complete"
      ? shiftMonth(periodStart, 1)
      : new Date(
          Date.UTC(
            month.getUTCFullYear(),
            month.getUTCMonth(),
            Math.max(day + 1, 1)
          )
        );

  return {
    state,
    day,
    daysInMonth,
    elapsedDays: day,
    label:
      state === "complete"
        ? `Month complete · ${daysInMonth} days`
        : state === "not-started"
          ? `Month not started · ${daysInMonth} days`
          : `Day ${day} of ${daysInMonth}`,
    periodStart,
    periodEnd
  };
}

function rangeLabel(start: Date, end: Date) {
  const inclusiveEnd = new Date(end.getTime() - 1);
  return `${periodDate.format(start)}–${periodDate.format(inclusiveEnd)}`;
}

export function getPreviousMonthComparison(
  month: Date,
  pace: MonthPace
): MonthComparison {
  const comparisonMonth = shiftMonth(month, -1);
  const comparisonDays = Math.min(
    pace.elapsedDays,
    daysInUtcMonth(comparisonMonth)
  );
  const periodStart = comparisonMonth;
  const periodEnd = new Date(
    Date.UTC(
      comparisonMonth.getUTCFullYear(),
      comparisonMonth.getUTCMonth(),
      comparisonDays + 1
    )
  );
  const available = comparisonDays > 0;

  return {
    month: comparisonMonth,
    periodStart,
    periodEnd,
    elapsedDays: comparisonDays,
    available,
    label: available
      ? `Previous month, same elapsed span: ${rangeLabel(periodStart, periodEnd)}`
      : `Previous-month comparison unavailable until ${monthLabel(month)} begins`
  };
}

export function monthPeriodLabel(pace: MonthPace) {
  if (pace.elapsedDays === 0) {
    return `${monthLabel(pace.periodStart)} has not started`;
  }
  return rangeLabel(pace.periodStart, pace.periodEnd);
}
