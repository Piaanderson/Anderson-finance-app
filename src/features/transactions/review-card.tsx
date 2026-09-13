export function ReviewCard({
  title,
  description,
  count
}: {
  title: string;
  description: string;
  count: number;
}) {
  if (count === 0) return null;
  const headingId = `review-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="card" aria-labelledby={headingId}>
      <span className="eyebrow">{count} to review</span>
      <h2 id={headingId}>{title}</h2>
      <p className="muted">{description}</p>
      <button className="button secondary" type="button">
        Review next
      </button>
    </section>
  );
}
