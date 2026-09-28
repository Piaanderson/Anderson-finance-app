export default function AuthenticatedLoading() {
  return (
    <div className="page-content" aria-busy="true">
      <section
        className="card route-loading"
        aria-labelledby="route-loading-title"
        role="status"
        aria-live="polite"
      >
        <span className="eyebrow">Currents</span>
        <p className="route-loading-title" id="route-loading-title">
          Loading your household view
        </p>
        <p className="muted">
          Account positions and movements are being prepared.
        </p>
      </section>
    </div>
  );
}
