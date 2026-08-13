'use client';

import { useRef } from 'react';
import {
  CHANNEL_LABEL,
  DATE_RANGES,
  DATE_RANGE_LABEL,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  filtersActive,
  type ActivityFilters,
  type ActivityTab,
} from '@/lib/review-activity';
import styles from './reviews.module.css';

/**
 * The filter bar.
 *
 * A REAL GET FORM, and that is the load-bearing decision. The filters live in
 * the URL — which is what makes a filtered view bookmarkable, shareable and
 * survivable across a server action's revalidate — and a plain form submitting
 * to the same path is the mechanism that already does that, with no state to
 * keep in step and no effect to write.
 *
 * The JavaScript below is enhancement only: changing a <select> submits the
 * form instead of making you reach for Apply. With JS off, Apply is still
 * there and still works. Nothing here is the only way to use the page.
 *
 * The tab rides along as a hidden input so that narrowing the date range does
 * not silently throw you back to "All requests".
 */
export default function ReviewFilters({
  filters,
  tab,
  basePath,
}: {
  filters: ActivityFilters;
  tab: ActivityTab;
  basePath: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  // requestSubmit rather than submit(): it runs validation and fires the submit
  // event, which is what Next's router intercepts for a client navigation.
  const submitNow = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} action={basePath} method="get" className={styles.filters} role="search">
      <input type="hidden" name="tab" value={tab} />

      <div className={`${styles.field} ${styles.search}`}>
        <label className={styles.fieldLabel} htmlFor="review-q">
          Search
        </label>
        <input
          id="review-q"
          name="q"
          type="search"
          defaultValue={filters.search}
          placeholder="Customer or job number"
          maxLength={80}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="review-range">
          Date range
        </label>
        <select id="review-range" name="range" defaultValue={filters.range} onChange={submitNow}>
          {DATE_RANGES.map((range) => (
            <option key={range} value={range}>
              {DATE_RANGE_LABEL[range]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="review-status">
          Status
        </label>
        <select id="review-status" name="status" defaultValue={filters.status} onChange={submitNow}>
          <option value="any">Any status</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {REQUEST_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="review-rating">
          Rating
        </label>
        <select id="review-rating" name="rating" defaultValue={String(filters.rating)} onChange={submitNow}>
          <option value="any">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="review-channel">
          Channel
        </label>
        <select id="review-channel" name="channel" defaultValue={filters.channel} onChange={submitNow}>
          <option value="any">Any channel</option>
          {(['sms', 'email', 'unknown'] as const).map((channel) => (
            <option key={channel} value={channel}>
              {CHANNEL_LABEL[channel]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterActions}>
        <button type="submit" className="btn secondary">
          Apply
        </button>
        {/* A link, not a reset button: reset would restore the values the form
            was rendered with, which are the ones being cleared. */}
        {filtersActive(filters) ? (
          <a className="btn ghost" href={`${basePath}?tab=${tab}`}>
            Clear
          </a>
        ) : null}
      </div>
    </form>
  );
}
