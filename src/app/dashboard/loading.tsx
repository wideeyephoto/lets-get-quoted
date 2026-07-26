// Shown instantly on every navigation between dashboard pages while the target
// page's server component fetches its data. Without this, the old page just sits
// there for ~1s (the DB round-trip) with no feedback; with it, the route flips
// immediately to a skeleton and the real page streams in when ready. The sidebar
// lives in the root layout (above this boundary), so it stays put and clickable.
export default function DashboardLoading() {
  return (
    <main className="wide-shell workspace-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="dash-skel-hero skeleton-block" aria-hidden="true" />
      <div className="dash-skel-grid" aria-hidden="true">
        <div className="dash-skel-card skeleton-block" />
        <div className="dash-skel-card skeleton-block" />
        <div className="dash-skel-card skeleton-block" />
      </div>
      <div className="dash-skel-wide skeleton-block" aria-hidden="true" />
    </main>
  );
}
