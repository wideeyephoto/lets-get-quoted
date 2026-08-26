import Link from 'next/link';
import InfoTip from '@/components/info-tip';
import type { Loadable, PriorityQueueSummary } from '@/lib/dashboard-types';

export default function PriorityQueue({
  priorityQueue,
}: {
  priorityQueue: Loadable<PriorityQueueSummary>;
}) {
  if (priorityQueue.kind === 'unavailable') {
    return (
      <section className="panel workspace-section-card priority-panel">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Act now</p>
          <h2>Needs your attention</h2>
        </div>
        <p className="workspace-card-copy" style={{ color: 'var(--muted)' }}>
          Priority queue data is temporarily unavailable.
        </p>
      </section>
    );
  }

  const { needsAttention, waitingOnCustomer } = priorityQueue.data;
  const topPriorities = needsAttention.slice(0, 3);
  const restPriorities = needsAttention.slice(3);

  return (
    <>
      {/* ACT NOW — needs contractor attention */}
      <section className="panel workspace-section-card priority-panel" data-tour-id="dashboard:needs-attention">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Act now</p>
          <h2>Needs your attention</h2>
        </div>
        {needsAttention.length > 0 ? (
          <>
            <div className="priority-list">
              {topPriorities.map((item, index) => (
                <Link href={item.href} className="priority-item" key={item.key}>
                  <span className="priority-index">{index + 1}</span>
                  <span className="priority-copy">
                    <strong>
                      {item.label}
                      {item.info ? <InfoTip label={`More information about ${item.label.toLowerCase()}`}>{item.info}</InfoTip> : null}
                    </strong>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </span>
                  <span className="priority-cta">{item.cta}</span>
                </Link>
              ))}
            </div>
            {restPriorities.length > 0 ? (
              <details className="priority-more">
                <summary>Show {restPriorities.length} more</summary>
                <div className="priority-list">
                  {restPriorities.map((item, index) => (
                    <Link href={item.href} className="priority-item" key={item.key}>
                      <span className="priority-index">{index + 4}</span>
                      <span className="priority-copy">
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </span>
                      <span className="priority-cta">{item.cta}</span>
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <div className="priority-empty">
            <strong>Nothing urgent right now.</strong>
            <span>Your leads, jobs, schedule, website, and payout setup are in good shape.</span>
          </div>
        )}
      </section>

      {/* WAITING — the customer's move, not yours */}
      {waitingOnCustomer.length > 0 ? (
        <section className="panel workspace-section-card priority-panel dash-waiting">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Waiting</p>
            <h2>With your customers</h2>
          </div>
          <div className="priority-list">
            {waitingOnCustomer.map((item) => (
              <Link href={item.href} className="priority-item" key={item.key}>
                <span className="priority-copy">
                  <strong>{item.label}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                </span>
                <span className="priority-cta">{item.cta}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
