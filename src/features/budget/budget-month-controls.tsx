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
  planExists,
  previousPlanExists
}: {
  monthLabel: string;
  monthKey: string;
  previousMonthKey: string;
  nextMonthKey: string;
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
    <div className="budget-month-controls">
      <nav className="month-navigation" aria-label="Budget months">
        <Link
          className="button secondary"
          href={`/budget?month=${previousMonthKey}`}
          aria-label={`Previous month, ${labelFor(previousMonthKey)}`}
        >
          ← Previous
        </Link>
        <span aria-current="date">{monthLabel}</span>
        <Link
          className="button secondary"
          href={`/budget?month=${nextMonthKey}`}
          aria-label={`Next month, ${labelFor(nextMonthKey)}`}
        >
          Next →
        </Link>
      </nav>
      {!planExists && previousPlanExists ? (
        <button
          className="button"
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
    </div>
  );
}
