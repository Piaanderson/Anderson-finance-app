"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signedUsd } from "@/lib/money";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/budget", label: "Budget" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/settings/security", label: "Security" }
] as const;

export function AppSidebar({ netWorth }: { netWorth: number }) {
  const pathname = usePathname();

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
        <span className="eyebrow">Net worth</span>
        <strong>{signedUsd(netWorth)}</strong>
        <span className="muted">Across connected accounts</span>
      </div>
    </aside>
  );
}
