import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './admin.module.css';

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
  actionLabel?: string;
  actionHref?: string;
  actionExternal?: boolean;
  actionNode?: ReactNode;
};

function leadText(item: AlertItem): string {
  return [item.status, item.title, item.subtitle].filter(Boolean).join(' — ');
}

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
  count?: number;
  emptyMessage: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  headerExtra?: ReactNode;
}) {
  const shownCount = count ?? items.length;
  const truncated = shownCount > items.length;
  const highestSeverity: AlertSeverity = items.some((i) => i.severity === 'bad')
    ? 'bad'
    : items.some((i) => i.severity === 'warn')
    ? 'warn'
    : 'neutral';

  return (
    <>
      <div className={styles.cardHead}>
        <h2 className={styles.panelTitle}>
          {items.length > 0 ? (
            <span className={`${styles.pulseDot} ${styles[highestSeverity] || ''}`} aria-hidden="true" />
          ) : null}
          <span>
            {title}
            {shownCount > 0 ? ` (${shownCount}${truncated ? ` — showing ${items.length}` : ''})` : ''}
          </span>
        </h2>
        {headerExtra}
      </div>

      <div className={styles.cardBody}>
        {items.length === 0 ? (
          <p className={styles.cardEmpty}>{emptyMessage}</p>
        ) : (
          <ul className={styles.alertList}>
            {items.map((item) => (
              <li key={item.key}>
                <span className={styles.alertMain}>
                  <span className={styles.alertLead} title={leadText(item)}>
                    <span className={`${styles.pill} ${styles[item.severity] || ''}`}>{item.status}</span>{' '}
                    <span className={styles.timelineActor} style={{ textTransform: 'none' }}>{item.title}</span>
                    {item.subtitle ? <span className={styles.muted}> — {item.subtitle}</span> : null}
                  </span>
                  <span className={styles.alertMeta}>
                    {item.owner ? (
                      <>
                        {item.ownerHref ? <Link href={item.ownerHref} className={styles.rowLink}>{item.owner}</Link> : item.owner}
                        {' · '}
                      </>
                    ) : null}
                    {item.age}
                  </span>
                </span>
                <span className={styles.alertAction}>
                  {item.actionNode ? (
                    item.actionNode
                  ) : item.actionHref && item.actionLabel ? (
                    item.actionExternal ? (
                      <a href={item.actionHref} target="_blank" rel="noreferrer" className={styles.rowLink}>{item.actionLabel} →</a>
                    ) : (
                      <Link href={item.actionHref} className={styles.rowLink}>{item.actionLabel} →</Link>
                    )
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewAllHref ? (
        <div className={styles.actionRow}>
          <Link href={viewAllHref} className="btn secondary" style={{ fontSize: '0.8rem' }}>
            {viewAllLabel ?? 'View all'}
          </Link>
        </div>
      ) : null}
    </>
  );
}
