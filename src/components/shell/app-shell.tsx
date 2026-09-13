import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";

export function AppShell({
  children,
  netWorth
}: {
  children: ReactNode;
  netWorth: number;
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell">
        <AppSidebar netWorth={netWorth} />
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
