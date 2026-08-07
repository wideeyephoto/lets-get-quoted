import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './admin.module.css';

// Every Command Center card renders its rows through this one shape, so
// "severity, owner, age, status, direct action" is consistent across a dozen
// very different signals instead of each card inventing its own layout.

export type AlertSeverity = 'bad' | 'warn' | 'good' | 'neutral';

export type AlertItem = {
  key: string;
  severity: AlertSeverity;
  status: string;
  title: string;
  subtitle?: string;
  owner?: string;
  ownerHref?: string;
  age: string;
  // Most rows link somewhere (actionLabel + actionHref). A few need a form
  // submit instead (e.g. "Mark resolved") — pass a pre-built node via
  // actionNode for those. Read-only log entries with no drill-down target yet
  // (e.g. the incidents/releases log) can omit all three.
  actionLabel?: string;
  actionHref?: string;
  actionExternal?: boolean;
  actionNode?: ReactNode;
};

export function AlertCard({
  title,
  items,
  count,
  emptyMessage,
  viewAllHref,
  viewAllLabel,
  headerExtra,
}: {
  title: string;
  items: AlertItem[];
  // Overrides the header count when the card only shows a capped preview
  // (e.g. 50 of a larger true total) — defaults to items.length otherwise.
  count?: number;
  emptyMessage: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  headerExtra?: ReactNode;
}) {
  const shownCount = count ?? items.length;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
        <p className={styles.panelTitle} style={{ margin: 0 }}>{title}{shownCount > 0 ? ` (${shownCount})` : ''}</p>
        {headerExtra}
      </div>
      {items.length === 0 ? (
        <p className={styles.emptyState} style={{ padding: '0.8rem 0' }}>{emptyMessage}</p>
      ) : (
        <ul className={styles.timeline}>
          {items.map((item) => (
            <li key={item.key} style={{ gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'start' }}>
              <span>
                <span className={`${styles.pill} ${styles[item.severity] || ''}`}>{item.status}</span>{' '}
                <span className={styles.timelineActor} style={{ textTransform: 'none' }}>{item.title}</span>
                {item.subtitle ? <span className={styles.muted}> — {item.subtitle}</span> : null}
                <br />
                <span className={styles.muted}>
                  {item.owner ? (
                    <>
                      {item.ownerHref ? <Link href={item.ownerHref} className={styles.rowLink}>{item.owner}</Link> : item.owner}
                      {' · '}
                    </>
                  ) : null}
                  {item.age}
                </span>
              </span>
              <div>
                {item.actionNode ? (
                  item.actionNode
                ) : item.actionHref && item.actionLabel ? (
                  item.actionExternal ? (
                    <a href={item.actionHref} target="_blank" rel="noreferrer" className={styles.rowLink}>{item.actionLabel} →</a>
                  ) : (
                    <Link href={item.actionHref} className={styles.rowLink}>{item.actionLabel} →</Link>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {viewAllHref && items.length > 0 ? (
        <div className={styles.actionRow}>
          <Link href={viewAllHref} className="btn secondary">{viewAllLabel ?? 'View all'}</Link>
        </div>
      ) : null}
    </>
  );
}
