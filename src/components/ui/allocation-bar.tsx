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
  return (
    <div>
      <div
        className="allocation"
        role="img"
        aria-label={`Income allocation: ${segments
          .map((segment) => `${segment.label} ${segment.amount} dollars`)
          .join(", ")}`}
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            style={{ flex: Math.max(segment.amount / income, 0.01) }}
          />
        ))}
      </div>
      <p className="muted">
        {segments
          .map((segment) => `${segment.label} $${segment.amount}`)
          .join(" · ")}
      </p>
    </div>
  );
}
