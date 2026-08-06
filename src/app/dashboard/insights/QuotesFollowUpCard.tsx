import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { Insights } from '@/lib/insights';

// Open quotes that are sitting unanswered — the money most easily recovered,
// because these customers already asked for a price. Counts and the dollar total
// are the whole open set; the list shows the biggest few (open quotes are sorted
// by value in the engine) with each one's age. "Stale" is the engine's own
// threshold — a quote raised more than two weeks ago — surfaced as a nudge, not
// invented here. A server component: it only reads and links.

export default function QuotesFollowUpCard({ opportunity }: { opportunity: Insights['opportunity'] }) {
  const { total, count, quotes, staleCount } = opportunity;

  return (
    <section className="panel ins-card ins-quotes-card">
      <p className="ins-card-head">
        <span className="ins-chip is-quote" aria-hidden="true">✎</span> Quotes needing follow-up
      </p>

      {count === 0 ? (
        <p className="ins-empty-note">
          No open quotes right now — everything you&apos;ve priced has been answered. New quotes waiting on a
          decision show up here.
        </p>
      ) : (
        <>
          <div className="ins-quotes-top">
            <div>
              <strong className="ins-big">{count}</strong>
              <span className="ins-sub">quote{count === 1 ? '' : 's'} awaiting a decision</span>
            </div>
            <div className="ins-quotes-total">
              <span className="ins-figure-label">On the table</span>
              <strong>{formatMoney(total)}</strong>
            </div>
          </div>

          {staleCount > 0 ? (
            <p className="ins-warn ins-quotes-stale">
              {staleCount} sent over two weeks ago — the longer they wait, the colder they get.
            </p>
          ) : null}

          <ul className="ins-quotes-list">
            {quotes.slice(0, 4).map((quote) => (
              <li key={quote.id} className="ins-quotes-row">
                <span className="ins-quotes-name">{quote.clientName}</span>
                <span className="ins-quotes-amt">{formatMoney(quote.amount)}</span>
                <span className="ins-quotes-age">{quote.ageDays}d old</span>
              </li>
            ))}
          </ul>

          <div className="ins-card-foot">
            {count > quotes.slice(0, 4).length ? (
              <span>{count - Math.min(4, quotes.length)} more not shown.</span>
            ) : <span />}
            <Link className="ins-inline-link" href="/dashboard/jobs?status=new_lead">Open quotes →</Link>
          </div>
        </>
      )}
    </section>
  );
}
