import type { ReactNode } from "react";
import type { HouseholdPositionSummary } from "@/features/accounts/position-summary";
import { AppSidebar } from "./app-sidebar";

export function AppShell({
  children,
  positionSummary
}: {
  children: ReactNode;
  positionSummary: HouseholdPositionSummary;
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell">
        <AppSidebar positionSummary={positionSummary} />
        <div className="app-main">
          <div className="mobile-brand">
            <strong>Currents</strong>
          </div>
          <main id="main-content">{children}</main>
        </div>
      </div>
    </>
  );
}
