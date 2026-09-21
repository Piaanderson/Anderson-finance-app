"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HouseholdPositionSummary } from "@/features/accounts/position-summary";
import { formatCurrency } from "@/lib/money";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/budget", label: "Budget" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/settings/security", label: "Security" }
] as const;

export function AppSidebar({
  positionSummary
}: {
  positionSummary: HouseholdPositionSummary;
}) {
  const pathname = usePathname();
  const hasMultipleCurrencies = positionSummary.totals.length > 1;

  return (
    <aside className="sidebar">
      <Link className="brand" href="/dashboard" aria-label="Currents home">
        <span className="brand-mark" aria-hidden="true" />
        <span>Currents</span>
      </Link>
      <nav aria-label="Primary">
        <ul className="nav-list">
          {links.map((link) => (
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
      <div className="net-worth">
        <span className="eyebrow">
          {hasMultipleCurrencies ? "Net worth by currency" : "Net worth"}
        </span>
        {positionSummary.totals.length === 0 ? (
          <strong>Unavailable</strong>
        ) : (
          positionSummary.totals.map((total) => (
            <strong key={total.currency}>
              {formatCurrency(total.amount, total.currency)}
            </strong>
          ))
        )}
        <span className="muted">
          {positionSummary.isComplete
            ? `${positionSummary.accountCount} active accounts`
            : "Partial — a balance or currency is missing"}
        </span>
      </div>
    </aside>
  );
}
