export const ADMIN_TIMEZONE = 'UTC';

export function formatUsd(dollarsInput: number | string | null | undefined, forceCents = false): string {
  const dollars = Number(dollarsInput) || 0;
  const isWhole = dollars % 1 === 0 && !forceCents;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(num: number | string | null | undefined): string {
  return (Number(num) || 0).toLocaleString('en-US');
}

export function formatTimestamp(dateValue: string | Date | null | undefined, format: 'short' | 'medium' = 'short'): string {
  if (!dateValue) return '—';
  
  const d = new Date(dateValue);
  if (!Number.isFinite(d.getTime())) return 'Unknown';

  return d.toLocaleString('en-US', {
    timeZone: ADMIN_TIMEZONE,
    dateStyle: format,
    timeStyle: 'short',
  }) + ' UTC';
}

export function capFirst(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
