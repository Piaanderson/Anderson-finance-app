import type { NetWorthHistory as NetWorthHistoryValue } from "./accounts-experience";
import { formatDecimalCurrency } from "@/lib/money";

const dateLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

function chartPoints(
  points: Extract<NetWorthHistoryValue, { status: "available" }>["points"]
) {
  const width = 720;
  const height = 180;
  const padding = 18;
  const values = points.map((point) => Number(point.amount));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const firstTime = points[0]!.effectiveAt.getTime();
  const timeSpan =
    points.at(-1)!.effectiveAt.getTime() - firstTime || points.length - 1 || 1;

  return points
    .map((point, index) => {
      const elapsed =
        point.effectiveAt.getTime() - firstTime ||
        (index / timeSpan) * timeSpan;
      const x = padding + (elapsed / timeSpan) * (width - padding * 2);
      const y =
        height -
        padding -
        ((Number(point.amount) - minimum) / span) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function NetWorthHistory({
  history
}: {
  history: NetWorthHistoryValue;
}) {
  return (
    <figure className="card net-worth-history" aria-labelledby="history-title">
      <figcaption>
        <span className="eyebrow">Snapshot-based · derived</span>
        <h2 id="history-title">Net worth, last 8 months</h2>
      </figcaption>
      {history.status === "unavailable" ? (
        <div className="history-unavailable">
          <strong>History unavailable</strong>
          <p className="muted">{history.reason}</p>
          <p className="muted">
            Currents never fills missing months or reconstructs past balances.
          </p>
        </div>
      ) : (
        <>
          <svg
            className="net-worth-chart"
            viewBox="0 0 720 180"
            role="img"
            aria-labelledby="history-chart-title history-chart-description"
          >
            <title id="history-chart-title">
              Net worth from recorded account position observations
            </title>
            <desc id="history-chart-description">
              {history.points.length} complete {history.currency} observations,
              from {dateLabel.format(history.points[0]!.effectiveAt)} to{" "}
              {dateLabel.format(history.points.at(-1)!.effectiveAt)}.
            </desc>
            <line x1="18" y1="162" x2="702" y2="162" />
            <polyline pathLength="1" points={chartPoints(history.points)} />
          </svg>
          <div className="history-caption">
            <p>
              <strong>
                {formatDecimalCurrency(
                  history.points.at(-1)!.amount,
                  history.currency
                )}
              </strong>{" "}
              at the latest complete observation
            </p>
            <p className="muted">
              Derived only from real position snapshots for accounts active
              today. Missing periods are not filled.
            </p>
          </div>
          <details className="history-data">
            <summary>View recorded history points</summary>
            <ol>
              {history.points.map((point) => (
                <li key={`${point.effectiveAt.toISOString()}-${point.amount}`}>
                  <time dateTime={point.effectiveAt.toISOString()}>
                    {dateLabel.format(point.effectiveAt)}
                  </time>
                  <strong>
                    {formatDecimalCurrency(point.amount, point.currency)}
                  </strong>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </figure>
  );
}
