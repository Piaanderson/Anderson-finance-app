import { signedUsd, usd } from "@/lib/money";
import type { BudgetDestinationView } from "./budget-data";
import type { BudgetSectionCalculation } from "./budget-domain";

export function BudgetSection({
  calculation,
  destinations
}: {
  calculation: BudgetSectionCalculation;
  destinations: Record<string, BudgetDestinationView | null>;
}) {
  const { section, rows } = calculation;
  const headingId = `budget-${section.toLowerCase()}`;
  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="section-heading">
        <h2 id={headingId}>{section}</h2>
        <strong>{usd.format(Number(calculation.planned))}</strong>
      </div>
      {rows.length ? (
        <ul className="budget-rows">
          {rows.map((row) => {
            const destination = destinations[row.id];
            return (
              <li className="budget-row" key={row.id}>
                <div>
                  <strong>{row.categoryName}</strong>
                  <div className="muted">
                    {destination
                      ? `${destination.name}${destination.mask ? ` · ${destination.mask}` : ""}${destination.active ? "" : " · inactive"}`
                      : "No destination account"}
                  </div>
                </div>
                <span className={row.over !== "0.00" ? "danger" : "muted"}>
                  {signedUsd(Number(row.activity))} {calculation.activityLabel}{" "}
                  ·{" "}
                  {row.over !== "0.00"
                    ? `${usd.format(Number(row.over))} over`
                    : `${usd.format(Number(row.remaining))} ${calculation.remainingLabel}`}
                </span>
                <strong className="row-amount">
                  {usd.format(Number(row.planned))}
                </strong>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No allocations in this section.</p>
      )}
    </section>
  );
}
