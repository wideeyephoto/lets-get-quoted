import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './admin.module.css';

/**
 * A number, and the way to the rows behind it.
 *
 * Every stat in this console used to be a `<span>` — a figure with no way to
 * ask which rows produced it. "Not onboarded: 12" is only useful if it can
 * become the twelve, so `href` is the point of this component and `drill` is
 * the visible promise that it exists.
 *
 * A card with no `href` still renders, because a couple of figures genuinely
 * have nowhere to go (a sum of money is not a list of anything). Those read as
 * plain text, so the ones that ARE clickable are distinguishable from the ones
 * that are not — an affordance nobody can trust is worse than none.
 */
export function StatCard({
  value,
  label,
  href,
  drill,
  note,
  tone,
  children,
}: {
  value: string | number;
  label: string;
  href?: string;
  /** The sentence under the number: what clicking it opens. */
  drill?: string;
  /** Working shown under the value — how a computed figure was arrived at. */
  note?: ReactNode;
  tone?: 'bad' | 'warn';
  children?: ReactNode;
}) {
  const body = (
    <>
      <span
        className={styles.statValue}
        style={tone === 'bad' ? { color: '#fca5a5' } : tone === 'warn' ? { color: '#ffd166' } : undefined}
      >
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </span>
      <span className={styles.statLabel}>{label}</span>
      {note ? <span className={styles.muted} style={{ fontSize: '0.72rem' }}>{note}</span> : null}
      {children}
      {href && drill ? <span className={styles.statDrill}>{drill} →</span> : null}
    </>
  );

  if (!href) return <div className={`${styles.panel} ${styles.statCard}`}>{body}</div>;
  return (
    <Link href={href} className={`${styles.panel} ${styles.statCard} ${styles.link}`}>
      {body}
    </Link>
  );
}
