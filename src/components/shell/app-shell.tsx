import type { ReactNode } from "react";
import type { HouseholdPositionSummary } from "@/features/accounts/position-summary";
import { AppSidebar } from "./app-sidebar";
import { MobileNavigation } from "./mobile-navigation";

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
          <MobileNavigation />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
