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
    <section
      className="card category-review"
      aria-labelledby={headingId}
      data-review-order="categories"
    >
      <span className="eyebrow">{count} to review</span>
      <h2 id={headingId}>{title}</h2>
      <p className="muted">{description}</p>
      <button className="button secondary category-review-action" type="button">
        Review next
      </button>
    </section>
  );
}
