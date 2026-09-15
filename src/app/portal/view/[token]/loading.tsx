/**
 * What a homeowner sees on a phone in a driveway with one bar.
 */
export default function Loading() {
  return (
    <main className="wide-shell workspace-shell client-job-dashboard quote-skeleton" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your portal&hellip;
      </p>

      <header className="quote-hero" aria-hidden="true">
        <span className="skel skel-line" style={{ width: '11rem' }} />
        <span className="skel skel-title" />
        <span className="skel skel-line" style={{ width: '17rem' }} />
        <span className="skel skel-pill" />
      </header>

      <div className="quote-deck" aria-hidden="true">
        <div className="quote-deck-main">
          <section className="panel workspace-section-card">
            <span className="skel skel-line" style={{ width: '8rem' }} />
            <span className="skel skel-line skel-tall" style={{ width: '60%' }} />
            <div className="quote-skeleton-rows">
              {[0, 1, 2, 3].map((row) => (
                <span className="skel skel-row" key={row} />
              ))}
            </div>
            <span className="skel skel-row skel-total" />
          </section>
        </div>

        <aside className="quote-deck-rail">
          <div className="quote-rail-sticky">
            <div className="quote-rail-card">
              <span className="skel skel-line" style={{ width: '5rem' }} />
              <span className="skel skel-title" style={{ width: '9rem' }} />
              <span className="skel skel-row" />
              <span className="skel skel-row" />
              <span className="skel skel-btn" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
