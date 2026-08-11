/**
 * What a homeowner sees on a phone in a driveway with one bar.
 *
 * This page makes eight database round trips before it can render a word, and
 * until now the browser showed the previous page — or nothing — for all of
 * them. A skeleton in the shape of the real thing is not decoration here: it is
 * the difference between "the link is loading" and "the link is broken", and
 * somebody who concludes the second one rings their contractor.
 *
 * Deliberately shapes only what is always there — the letterhead, the hero, the
 * document and the summary rail. Nothing here implies a section that may not
 * exist, because a skeleton that promises a payment card and then renders none
 * is its own small lie.
 */
export default function Loading() {
  return (
    <main className="wide-shell workspace-shell client-job-dashboard qstyle-signature quote-skeleton" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your quote…
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
