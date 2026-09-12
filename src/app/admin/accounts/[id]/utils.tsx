import styles from '../../admin.module.css';

export function usdCents(cents: unknown): string {
  if (typeof cents !== 'number') return '—';
  return '$' + (cents / 100).toFixed(2);
}
export function fmtDate(v: unknown): string {
  if (!v) return '—';
  try {
    const d = new Date(v as string | number | Date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}
export function fmtDateTime(v: unknown): string {
  if (!v) return '—';
  try {
    const d = new Date(v as string | number | Date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}
export function bool(v: unknown): boolean {
  return v === true;
}
export function words(v: unknown): string {
  if (!v || typeof v !== 'string') return '—';
  return v.replace(/_/g, ' ');
}
export function initials(name: unknown): string {
  if (!name || typeof name !== 'string') return 'AC';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function PaymentStatusPill({ status }: { status: string | null }) {
  const s = status ?? 'requested';
  const cls = s === 'paid' ? styles.good : s === 'disputed' ? styles.bad : s === 'refunded' ? styles.warn : s === 'failed' ? styles.bad : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{s}</span>;
}
