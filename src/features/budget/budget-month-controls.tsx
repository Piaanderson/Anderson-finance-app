"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function labelFor(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function BudgetMonthControls({
  monthLabel,
  monthKey,
  previousMonthKey,
  nextMonthKey,
  todayMonthKey,
  context,
  planExists,
  previousPlanExists
}: {
  monthLabel: string;
  monthKey: string;
  previousMonthKey: string;
  nextMonthKey: string;
  todayMonthKey: string;
  context: string;
  planExists: boolean;
  previousPlanExists: boolean;
}) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!copied || !planExists) return;
    document.getElementById("budget-summary-title")?.focus();
  }, [copied, planExists]);

  async function copyPreviousMonth() {
    setCopying(true);
    setError("");
    const response = await fetch("/api/budget/months/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceMonth: previousMonthKey,
        targetMonth: monthKey
      })
    }).catch(() => null);
    if (!response?.ok) {
      const payload = response
        ? ((await response.json().catch(() => null)) as {
            error?: string;
          } | null)
        : null;
      setError(
        payload?.error ??
          "The previous month could not be copied. Check your connection and try again."
      );
      setCopying(false);
      return;
    }
    setCopied(true);
    setCopying(false);
    router.refresh();
  }

  return (
    <header className="budget-month-controls">
      <div className="budget-month-primary">
        <nav className="month-navigation" aria-label="Budget months">
          <Link
            className="budget-month-arrow"
            href={`/budget?month=${previousMonthKey}`}
            aria-label={`Previous month, ${labelFor(previousMonthKey)}`}
          >
            <span aria-hidden="true">←</span>
          </Link>
          <Link
            className="budget-month-arrow"
            href={`/budget?month=${nextMonthKey}`}
            aria-label={`Next month, ${labelFor(nextMonthKey)}`}
          >
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
        <div className="budget-title-copy">
          <p className="eyebrow">{context}</p>
          <h1>Budget</h1>
        </div>
        <Link
          className="button secondary budget-today"
          href="/budget"
          aria-current={monthKey === todayMonthKey ? "date" : undefined}
        >
          Today
        </Link>
      </div>
      <div
        className="budget-adjacent-months"
        aria-label="Adjacent budget months"
      >
        <Link href={`/budget?month=${previousMonthKey}`}>
          ← {labelFor(previousMonthKey)}
        </Link>
        <span aria-current="date">{monthLabel}</span>
        <Link href={`/budget?month=${nextMonthKey}`}>
          {labelFor(nextMonthKey)} →
        </Link>
      </div>
      {!planExists && previousPlanExists ? (
        <button
          className="button budget-copy-plan"
          type="button"
          disabled={copying}
          onClick={copyPreviousMonth}
        >
          {copying ? "Copying…" : `Copy ${labelFor(previousMonthKey)} plan`}
        </button>
      ) : null}
      <div className="visually-hidden" role="status" aria-live="polite">
        {copied ? `${monthLabel} budget copied and ready to review.` : ""}
      </div>
      {error ? <div role="alert">{error}</div> : null}
    </header>
  );
}
