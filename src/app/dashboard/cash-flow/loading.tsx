export default function CashFlowLoading() {
  return (
    <main className="wide-shell workspace-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cash flow forecast…</span>
      <div className="dash-skel-hero skeleton-block" aria-hidden="true" style={{ height: '140px' }} />
      <div className="dash-skel-wide skeleton-block" aria-hidden="true" style={{ height: '280px', marginBottom: '1.25rem' }} />
      <div className="dash-skel-grid" aria-hidden="true">
        <div className="dash-skel-card skeleton-block" />
        <div className="dash-skel-card skeleton-block" />
        <div className="dash-skel-card skeleton-block" />
      </div>
    </main>
  );
}
