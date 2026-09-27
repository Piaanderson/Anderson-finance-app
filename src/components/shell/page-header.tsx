import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  kicker?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, kicker, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {kicker ? <span className="eyebrow">{kicker}</span> : null}
        <h1>{title}</h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
