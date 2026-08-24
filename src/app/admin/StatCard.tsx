import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './admin.module.css';

export type StatAccent = 'amber' | 'emerald' | 'indigo' | 'rose' | 'neutral';

export function StatCard({
  value,
  label,
  href,
  drill,
  note,
  tone,
  accent = 'neutral',
  children,
}: {
  value: string | number;
  label: string;
  href?: string;
  drill?: string;
  note?: ReactNode;
  tone?: 'bad' | 'warn';
  accent?: StatAccent;
  children?: ReactNode;
}) {
  const accentClass =
    accent === 'amber'
      ? styles.accentAmber
      : accent === 'emerald'
      ? styles.accentEmerald
      : accent === 'indigo'
      ? styles.accentIndigo
      : accent === 'rose'
      ? styles.accentRose
      : styles.accentNeutral;

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

  if (!href) return <div className={`${styles.panel} ${styles.statCard} ${accentClass}`}>{body}</div>;
  return (
    <Link href={href} className={`${styles.panel} ${styles.statCard} ${accentClass} ${styles.link}`}>
      {body}
    </Link>
  );
}
