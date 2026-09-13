import { usd } from "@/lib/money";

export type BudgetRow = {
  name: string;
  planned: number;
  destination: string;
  status: string;
};

export function BudgetSection({
  title,
  rows
}: {
  title: string;
  rows: BudgetRow[];
}) {
  const total = rows.reduce((sum, row) => sum + row.planned, 0);
  const headingId = `budget-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="section-heading">
        <h2 id={headingId}>{title}</h2>
        <strong>{usd.format(total)}</strong>
      </div>
      <div>
        {rows.map((row) => (
          <div className="budget-row" key={row.name}>
            <div>
              <strong>{row.name}</strong>
              <div className="muted">{row.destination}</div>
            </div>
            <span className="muted">{row.status}</span>
            <strong className="row-amount">{usd.format(row.planned)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
