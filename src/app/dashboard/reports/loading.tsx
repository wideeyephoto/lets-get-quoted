export default function ReportsLoading() {
  return (
    <main className="wide-shell workspace-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading financial reports…</span>
      <div className="dash-skel-hero skeleton-block" aria-hidden="true" style={{ height: '110px' }} />
      <div className="dash-skel-wide skeleton-block" aria-hidden="true" style={{ height: '320px', marginBottom: '1.25rem' }} />
    </main>
  );
}
