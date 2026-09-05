'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PERIOD_MODES, buildPeriodHref, type PayPeriod } from '@/lib/labor';
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
  const canonicalTab = tab === 'hours' ? 'timecards' : tab;
  const [customFrom, setCustomFrom] = useState(period.startIso ? period.startIso.slice(0, 10) : '');
  const [customTo, setCustomTo] = useState(
    period.endIso
      ? new Date(new Date(period.endIso).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
      : '',
  );

  const isCustom = period.mode === 'custom';
  const isCurrent = (period.offset ?? 0) >= 0;

  return (
    <div className={styles.periodBar} role="region" aria-label="Pay period controls">
      <div className={styles.periodNav}>
        {isCustom ? (
          <span
            className="btn secondary sm disabled"
            aria-disabled="true"
            title="Stepping is disabled for custom ranges"
            style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}
          >
            ← Prev
          </span>
        ) : (
          <Link
            href={buildPeriodHref({
              basePath,
              tab: canonicalTab,
              period,
              patch: { offset: (period.offset ?? 0) - 1 },
              extraParams,
            })}
            className="btn secondary sm"
            aria-label="Previous period"
            title="Previous period"
          >
            ← Prev
          </Link>
        )}
        <span className={styles.sharedPeriodLabel}>
          <strong>{period.rangeLabel}</strong>
          {period.offset === 0 && !isCustom ? <span className={styles.currentTag}>Current</span> : null}
        </span>
        {isCustom || isCurrent ? (
          <span
            className="btn secondary sm disabled"
            aria-disabled="true"
            title={isCustom ? 'Stepping is disabled for custom ranges' : 'Cannot step past current period'}
            style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}
          >
            Next →
          </span>
        ) : (
          <Link
            href={buildPeriodHref({
              basePath,
              tab: canonicalTab,
              period,
              patch: { offset: (period.offset ?? 0) + 1 },
              extraParams,
            })}
            className="btn secondary sm"
            aria-label="Next period"
            title="Next period"
          >
            Next →
          </Link>
        )}
        {!isCustom && period.offset !== 0 ? (
          <Link
            href={buildPeriodHref({
              basePath,
              tab: canonicalTab,
              period,
              patch: { offset: 0 },
              extraParams,
            })}
            className="btn quiet sm"
            style={{ fontSize: '0.78rem' }}
          >
            Reset to current
          </Link>
        ) : null}
      </div>

      <div className={styles.periodModesTrack}>
        <span className="sr-only">Period mode</span>
        {PERIOD_MODES.map((mode) => (
          <Link
            key={mode.id}
            href={buildPeriodHref({
              basePath,
              tab: canonicalTab,
              period,
              patch: { period: mode.id, offset: 0, from: null, to: null },
              extraParams,
            })}
            className={`${styles.modeBtn}${period.mode === mode.id ? ` ${styles.modeBtnActive}` : ''}`}
            aria-current={period.mode === mode.id ? 'true' : undefined}
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
            window.location.href = buildPeriodHref({
              basePath,
              tab: canonicalTab,
              period,
              patch: {
                period: 'custom',
                offset: null,
                from: customFrom,
                to: customTo,
              },
              extraParams,
            });
          }}
        >
          <input type="hidden" name="tab" value={canonicalTab} />
          <input type="hidden" name="period" value="custom" />
          {Object.entries(extraParams).map(([key, value]) =>
            value != null && value !== '' ? (
              <input key={key} type="hidden" name={key} value={String(value)} />
            ) : null,
          )}
          <label>
            <span className="sr-only">From date</span>
            <input
              type="date"
              name="from"
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
              name="to"
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
