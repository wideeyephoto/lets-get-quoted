import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './admin.module.css';

// Every Command Center card renders its rows through this one shape, so
// "severity, owner, age, status, direct action" is consistent across a dozen
// very different signals instead of each card inventing its own layout.
//
// It is also what makes the cards the same SIZE. Three fixed parts — a header,
// a list that scrolls inside its own bounds, and a footer pinned to the bottom
// — so a card holding 46 rows is exactly as tall as a card holding one, and a
// row of cards lines up along both edges. Before this, a single busy card was
// 2,000px tall and sat alone on a grid row with five empty columns beside it.

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

// The lead line is clipped to one line so rows are a uniform height. Nothing is
// lost — the full text is the row's tooltip, and a long Stripe error reading
// "…is not a function" over two wrapped lines was never the readable option.
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
  // Overrides the header count when the card only shows a capped preview
  // (e.g. 50 of a larger true total) — defaults to items.length otherwise.
  count?: number;
  emptyMessage: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  headerExtra?: ReactNode;
}) {
  const shownCount = count ?? items.length;
  // When `count` is the true total and the rows are capped, the header used to
  // print the total alone above a shorter list — "Not onboarded (214)" over 50
  // rows, with nothing saying so. That is the same quiet lie as a number that
  // leads nowhere: the reader takes the list to be the number.
  const truncated = shownCount > items.length;
  return (
    <>
      <div className={styles.cardHead}>
        <p className={styles.panelTitle}>
          {title}
          {shownCount > 0 ? ` (${shownCount}${truncated ? ` — showing ${items.length}` : ''})` : ''}
        </p>
        {headerExtra}
      </div>

      {/* Scrolls within the card rather than stretching it. The rows are all
          still here and all still reachable — several of these signals have no
          full-list page to hand off to, so capping the rows would have put them
          out of reach entirely. */}
      <div className={styles.cardBody}>
        {/* The board routes a card with no rows to its All-clear strip, so this
            branch is a fallback for any other caller rather than the usual path. */}
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
          <Link href={viewAllHref} className="btn secondary">
            {viewAllLabel ?? 'View all'}
          </Link>
        </div>
      ) : null}
    </>
  );
}
