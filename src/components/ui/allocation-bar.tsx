type Segment = {
  label: string;
  amount: number;
};

export function AllocationBar({
  income,
  segments
}: {
  income: number;
  segments: Segment[];
}) {
  const planned = segments.reduce(
    (total, segment) => total + Math.max(segment.amount, 0),
    0
  );
  const scale = Math.max(income, planned, 1);
  const left = Math.max(income - planned, 0);
  return (
    <div>
      <div
        className="allocation"
        role="img"
        aria-label={`Income plan ${income} dollars. Allocations: ${segments
          .map((segment) => `${segment.label} ${segment.amount} dollars`)
          .join(", ")}. Left to budget ${income - planned} dollars.`}
      >
        {segments
          .filter((segment) => segment.amount > 0)
          .map((segment) => (
            <span
              key={segment.label}
              className="allocation-segment"
              data-section={segment.label}
              style={{ width: `${(segment.amount / scale) * 100}%` }}
            />
          ))}
        {left > 0 ? (
          <span
            className="allocation-segment"
            data-section="Unallocated"
            style={{ width: `${(left / scale) * 100}%` }}
          />
        ) : null}
      </div>
      <p className="muted">
        {segments
          .map((segment) => `${segment.label} $${segment.amount}`)
          .join(" · ")}
      </p>
    </div>
  );
}
