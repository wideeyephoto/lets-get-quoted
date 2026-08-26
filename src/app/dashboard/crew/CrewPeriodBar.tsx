'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PERIOD_MODES, type PayPeriod } from '@/lib/labor';
import styles from './crew.module.css';

export default function CrewPeriodBar({
  period,
  basePath = '/dashboard/crew',
  tab = 'timecards',
  extraParams = {},
}: {
  period: PayPeriod;
  basePath?: string;
  tab?: string;
  extraParams?: Record<string, string | null | undefined>;
}) {
  const [customFrom, setCustomFrom] = useState(period.startIso.slice(0, 10));
  const [customTo, setCustomTo] = useState(period.endIso.slice(0, 10));

  function buildHref(patch: Record<string, string | number | null | undefined>): string {
    const query = new URLSearchParams();
    query.set('tab', tab);
    if (period.mode) query.set('period', period.mode);
    if (period.offset) query.set('offset', String(period.offset));

    for (const [key, value] of Object.entries(extraParams)) {
      if (value != null && value !== '') query.set(key, value);
    }

    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') query.delete(key);
      else query.set(key, String(value));
    }

    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className={styles.periodBar} role="region" aria-label="Pay period controls">
      <div className={styles.periodNav}>
        <Link
          href={buildHref({ offset: (period.offset ?? 0) - 1 })}
          className="btn secondary sm"
          aria-label="Previous period"
          title="Previous period"
        >
          ← Prev
        </Link>
        <span className={styles.periodLabel}>
          <strong>{period.rangeLabel}</strong>
          {period.offset === 0 ? <span className={styles.currentTag}>Current</span> : null}
        </span>
        <Link
          href={buildHref({ offset: (period.offset ?? 0) + 1 })}
          className="btn secondary sm"
          aria-label="Next period"
          title="Next period"
        >
          Next →
        </Link>
        {period.offset !== 0 ? (
          <Link
            href={buildHref({ offset: 0 })}
            className="btn quiet sm"
            style={{ fontSize: '0.78rem' }}
          >
            Reset to current
          </Link>
        ) : null}
      </div>

      <div className={styles.periodModes}>
        <span className="sr-only">Period mode</span>
        {PERIOD_MODES.map((mode) => (
          <Link
            key={mode.id}
            href={buildHref({ period: mode.id, offset: 0, from: null, to: null })}
            className={`${styles.modeBtn}${period.mode === mode.id ? ` ${styles.modeBtnActive}` : ''}`}
            aria-pressed={period.mode === mode.id}
          >
            {mode.label}
          </Link>
        ))}
      </div>

      {period.mode === 'custom' ? (
        <form
          action={basePath}
          method="get"
          className={styles.customPeriodForm}
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = buildHref({
              period: 'custom',
              offset: null,
              from: customFrom,
              to: customTo,
            });
          }}
        >
          <label>
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              required
            />
          </label>
          <span>to</span>
          <label>
            <span className="sr-only">To date</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn secondary sm">
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
