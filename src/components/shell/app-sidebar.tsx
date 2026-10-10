"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HouseholdPositionSummary } from "@/features/accounts/position-summary";
import { formatDecimalCurrency } from "@/lib/money";
import { appNavigationLinks } from "./navigation-links";

export function AppSidebar({
  positionSummary
}: {
  positionSummary: HouseholdPositionSummary;
}) {
  const pathname = usePathname();
  const hasMultipleCurrencies = positionSummary.totals.length > 1;
  const hasKnownTotal = positionSummary.totals.length > 0;
  const netWorthLabel = !positionSummary.isComplete
    ? hasMultipleCurrencies
      ? "Partial net worth by currency"
      : "Partial net worth"
    : hasMultipleCurrencies
      ? "Net worth by currency"
      : "Net worth";

  return (
    <aside className="sidebar" aria-label="Application sidebar">
      <Link className="brand" href="/dashboard" aria-label="Currents home">
        <span className="brand-mark" aria-hidden="true" />
        <span>Currents</span>
      </Link>
      <nav aria-label="Primary">
        <ul className="nav-list">
          {appNavigationLinks.map((link) => (
            <li key={link.href}>
              <Link
                className="nav-link"
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div
        className="net-worth"
        data-state={
          !hasKnownTotal
            ? "unavailable"
            : positionSummary.isComplete
              ? hasMultipleCurrencies
                ? "multi-currency"
                : "complete"
              : "partial"
        }
      >
        <span className="eyebrow">{netWorthLabel}</span>
        <span className="net-worth-values">
          {hasKnownTotal ? (
            positionSummary.totals.map((total) => (
              <strong key={total.currency}>
                {formatDecimalCurrency(total.amount, total.currency)}
              </strong>
            ))
          ) : (
            <strong>Unavailable</strong>
          )}
        </span>
        <span
          className={
            positionSummary.isComplete
              ? "net-worth-context"
              : "net-worth-context warning"
          }
        >
          {positionSummary.isComplete
            ? `${positionSummary.accountCount} active ${
                positionSummary.accountCount === 1 ? "account" : "accounts"
              }`
            : "Partial — a balance or currency is missing"}
        </span>
      </div>
    </aside>
  );
}
