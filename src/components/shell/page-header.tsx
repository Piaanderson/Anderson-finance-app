import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  kicker?: string;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  kicker = "September 2026 · day 12 of 30 · income $8,240",
  actions
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <span className="eyebrow">{kicker}</span>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
