type Segment = {
  label: string;
  amount: number;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

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
    <figure className="allocation-figure">
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
      <figcaption className="visually-hidden">
        Planned allocation of {currency.format(planned)} against{" "}
        {currency.format(income)} income.
      </figcaption>
      <ul className="allocation-legend" aria-label="Allocation legend">
        {segments.map((segment) => (
          <li key={segment.label}>
            <span
              className="allocation-key"
              data-section={segment.label}
              aria-hidden="true"
            />
            <span>{segment.label}</span>
            <strong>{currency.format(segment.amount)}</strong>
          </li>
        ))}
        {left > 0 ? (
          <li>
            <span
              className="allocation-key"
              data-section="Unallocated"
              aria-hidden="true"
            />
            <span>Unallocated</span>
            <strong>{currency.format(left)}</strong>
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
