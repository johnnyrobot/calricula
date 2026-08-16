export function RepositoryBootstrap() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="repository-state"
      role="status"
      aria-live="polite"
      aria-label="Preparing the local curriculum workspace"
    >
      <div className="repository-state-card">
        <div className="catalog-spinner" aria-hidden="true" />
        <h1>Preparing your local catalog</h1>
        <p>
          Calricula is opening the browser workspace and adding sample records
          if this is your first visit.
        </p>
      </div>
    </main>
  );
}
