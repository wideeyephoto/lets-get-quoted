import Link from 'next/link';
import type { CommunicationSummary, Loadable } from '@/lib/dashboard-types';

export default function CommunicationsPanel({
  communications,
  basePath = '/dashboard',
}: {
  communications: Loadable<CommunicationSummary>;
  basePath?: string;
}) {
  if (communications.kind === 'unavailable') {
    return null;
  }

  const { waitingThreads, unreadTotal } = communications.data;

  if (waitingThreads.length === 0 && unreadTotal === 0) {
    return null;
  }

  return (
    <section className="panel workspace-section-card comms-panel">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">Inbox</p>
          <h2>Customer messages waiting</h2>
        </div>
        <Link href={`${basePath}/messages`} style={{ fontSize: '0.84rem', color: 'var(--accent)', textDecoration: 'none' }}>
          Open inbox ({unreadTotal} unread) &rarr;
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {waitingThreads.map((thread) => (
          <Link
            key={thread.phone}
            href={thread.href}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: '0.65rem',
              alignItems: 'center',
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--line, rgba(255,255,255,0.08))',
              background: thread.unreadCount > 0 ? 'rgba(255, 122, 33, 0.04)' : 'rgba(255,255,255,0.02)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {thread.unreadCount > 0 ? (
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent, #ff7a21)', flexShrink: 0 }} />
                ) : null}
                <strong style={{ fontSize: '0.92rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {thread.clientName}
                </strong>
                <span style={{ fontSize: '0.76rem', color: 'var(--muted)', flexShrink: 0 }}>
                  · {thread.waitingDuration}
                </span>
              </div>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {thread.lastMessageSnippet}
              </p>
            </div>
            <span className="btn secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', flexShrink: 0 }}>
              Reply
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
