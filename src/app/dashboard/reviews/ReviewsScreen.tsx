import Link from 'next/link';
import { Suspense } from 'react';
import AutomationLink from '@/components/automation-link';
import CopyReviewLink from './CopyReviewLink';
import {
  ACTIVITY_TABS,
  ACTIVITY_TAB_LABEL,
  CHANNEL_LABEL,
  DATE_RANGE_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  type ActivityRow,
  type ActivityTab,
  type ActivityView,
  type Kpi,
} from '@/lib/review-activity';
import ReviewFilters from './ReviewFilters';
import ReviewDrawer from './ReviewDrawer';
import styles from './reviews.module.css';

/**
 * Reputation and feedback.
 *
 * Still split out of page.tsx so the logged-out demo renders the same screen —
 * see the note on CampaignsScreen. `readOnly` turns the automation switch into
 * a state badge and takes the write actions off the drawer; it does NOT change
 * a single number, because the demo's whole value is that its numbers agree
 * with each other and with the job list.
 *
 * TWO THINGS ON THIS PAGE ARE COMPLIANCE, NOT DESIGN, and neither is negotiable:
 *
 *   1. Every customer is offered both routes regardless of rating. Nothing here
 *      can change that — the routing function takes no rating (see
 *      src/lib/review-routing.ts) — but the page must not IMPLY otherwise
 *      either. The private-feedback panel is ordered worst-first for triage of
 *      what already happened; it is not a queue anybody was diverted into.
 *   2. The Google metric counts PAGE OPENS. Google does not tell us whether a
 *      review was posted, so no label on this page may say "reviews received".
 *      "Google page visits" is the honest name and the note under it says why.
 */

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stars(rating: number | null): string {
  if (!rating) return '';
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
}

/** The tone class the shared .status-badge already ships. */
const TONE_CLASS = { neutral: 'status-new', good: 'status-complete', warn: 'status-warn' } as const;

function hrefWith(basePath: string, params: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * "vs previous period", or nothing.
 *
 * Renders nothing at all when there is no previous window rather than a grey
 * zero — "All time" has no earlier data by definition, and a 0 there reads as
 * "no change" when the truth is "no comparison".
 */
function Delta({ kpi, unit = '', invert = false }: { kpi: Kpi; unit?: string; invert?: boolean }) {
  if (kpi.delta === null) return null;
  if (kpi.delta === 0) {
    return <span className={`${styles.delta} ${styles.deltaFlat}`}>No change vs previous period</span>;
  }
  const up = kpi.delta > 0;
  const good = invert ? !up : up;
  return (
    <span className={`${styles.delta} ${good ? styles.deltaUp : styles.deltaDown}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {`${up ? '+' : ''}${kpi.delta}${unit} vs previous period`}
    </span>
  );
}

export type ReviewsScreenProps = {
  view: ActivityView;
  /** The row named by ?open=, already scoped to this account. */
  openRow: ActivityRow | null;
  reviewsOn: boolean;
  /** The account-level link an owner can hand out. Null when none is set up. */
  publicReviewUrl: string | null;
  nowIso: string;
  basePath?: string;
  /** The demo: the automation toggle is shown as state, not as a control. */
  readOnly?: boolean;
};

export default function ReviewsScreen({
  view,
  openRow,
  reviewsOn,
  publicReviewUrl,
  nowIso,
  basePath = '/dashboard',
  readOnly = false,
}: ReviewsScreenProps) {
  const { filters, tab, kpis, counts, visible, privateRows, trend, totalEver } = view;

  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.range !== '30d') params.set('range', filters.range);
  if (filters.status !== 'any') params.set('status', filters.status);
  if (filters.rating !== 'any') params.set('rating', String(filters.rating));
  if (filters.channel !== 'any') params.set('channel', filters.channel);

  const reviewsPath = `${basePath}/reviews`;
  const neverAsked = totalEver === 0;

  return (
    <main className="wide-shell workspace-shell">
      {/* ---- header ---------------------------------------------------- */}
      {/* workspace-hero-solo: the shared .workspace-hero is a two-column grid
          whose second cell is normally a metrics block. This page's metrics are
          the four cards below, so without the solo modifier the policy
          disclosure gets promoted into that second column and stretches to the
          hero's full height as a tall empty box. */}
      <section className="workspace-hero workspace-hero-solo panel">
        <div className={styles.head}>
          <div className={styles.headCopy}>
            <p className="eyebrow">Reviews</p>
            <h1 className="workspace-title">Reputation &amp; feedback</h1>
            <p className="workspace-lead">
              Every review request in one place — who was asked, who replied, and what came back.
            </p>
          </div>

          <div className={styles.headActions}>
            {readOnly ? (
              <span className={styles.autoState}>
                <span className={`${styles.autoDot}${reviewsOn ? ` ${styles.autoDotOn}` : ''}`} aria-hidden="true" />
                Auto requests {reviewsOn ? 'on' : 'off'}
              </span>
            ) : (
              <>
                <Link className="btn primary" href={`${basePath}/jobs?status=complete`}>
                  Request a review
                </Link>
                {publicReviewUrl ? (
                  <CopyReviewLink url={publicReviewUrl} />
                ) : (
                  <button type="button" className="btn secondary" disabled aria-describedby="no-review-link">
                    Copy review link
                  </button>
                )}
                <AutomationLink id="reviews" label="Review automation" on={reviewsOn} />
              </>
            )}
          </div>
        </div>

        {!readOnly && !publicReviewUrl ? (
          <p className={styles.notBuilt} id="no-review-link">
            There is no review link to copy yet — link your Google Business Profile in the website
            builder and it will appear here.
          </p>
        ) : null}

        {/* The compliance explanation, one keystroke away instead of one scroll
            in the way. It used to be a permanent four-line paragraph above the
            numbers. */}
        <details className={styles.policy}>
          <summary className={styles.policySummary}>
            Why every customer gets both options
          </summary>
          <p className={styles.policyBody}>
            Every customer is offered the same two routes: a public review and a private word with
            you. We don&apos;t screen by rating — Google prohibits sending only happy customers to a
            review page, and it&apos;s your Business Profile that gets restricted for it, not ours.
            The star rating below is your own service signal; it decides nothing about what the
            customer was shown.
          </p>
        </details>
      </section>

      {neverAsked ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No review requests yet. Every request routes through a &ldquo;how did we do?&rdquo; page
            that offers a public review and a private note, and the results show up here.
          </p>
        </section>
      ) : (
        <>
          {/* ---- four KPI cards ------------------------------------------ */}
          <div className="workspace-metric-grid four-up">
            <article className="workspace-metric-card accent">
              <span className="workspace-metric-label">Average rating</span>
              <strong className="workspace-metric-value">
                {kpis.averageRating.value !== null ? kpis.averageRating.value.toFixed(1) : '—'}
              </strong>
              <p className="workspace-metric-note">
                {kpis.rated > 0
                  ? `${stars(Math.round(kpis.averageRating.value ?? 0))} · ${kpis.rated} rated`
                  : 'Nobody has rated yet'}
              </p>
              <Delta kpi={kpis.averageRating} />
            </article>

            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Response rate</span>
              <strong className="workspace-metric-value">
                {kpis.responseRate.value !== null ? `${kpis.responseRate.value}%` : '—'}
              </strong>
              <p className="workspace-metric-note">
                {kpis.responded} of {kpis.sent} asked responded.
              </p>
              <Delta kpi={kpis.responseRate} unit="%" />
            </article>

            <article className="workspace-metric-card">
              {/* NOT "Google reviews". Google never tells us whether a review
                  was posted; all we can see is that the page was opened. */}
              <span className="workspace-metric-label">Google page visits</span>
              <strong className="workspace-metric-value">{kpis.googleVisits.value ?? 0}</strong>
              <p className="workspace-metric-note">
                Opened your Google review page. Google does not report whether a review was posted.
              </p>
              <Delta kpi={kpis.googleVisits} />
            </article>

            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Private feedback</span>
              <strong className="workspace-metric-value">{kpis.privateFeedback.value ?? 0}</strong>
              <p className="workspace-metric-note">
                Straight to you, not published.
                {kpis.unresolvedPrivate > 0 ? ` ${kpis.unresolvedPrivate} still open.` : ''}
              </p>
              <Delta kpi={kpis.privateFeedback} invert />
            </article>
          </div>

          {/* ---- filters -------------------------------------------------- */}
          <section className="panel workspace-section-card" aria-labelledby="review-filters-title">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow" id="review-filters-title">
                Filter · {DATE_RANGE_LABEL[filters.range]}
              </p>
            </div>
            <Suspense fallback={null}>
              <ReviewFilters filters={filters} tab={tab} basePath={reviewsPath} />
            </Suspense>
          </section>

          {/* ---- distribution + trend ------------------------------------- */}
          <section className="panel workspace-section-card" aria-labelledby="review-breakdown-title">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow" id="review-breakdown-title">
                Rating breakdown
              </p>
            </div>
            {kpis.rated === 0 ? (
              <p className="empty-state">
                No ratings in this period, so there is nothing to break down. The bars come back as
                soon as somebody rates a job.
              </p>
            ) : (
              <div className="review-bars">
                {kpis.distribution.map((bar) => (
                  <div key={bar.rating} className="review-bar-row">
                    <span className="review-bar-label">{bar.rating}★</span>
                    <div className="review-bar-track">
                      {/* Width is the share of ratings RECEIVED — the same
                          number printed beside it. The old bar was scaled to
                          the tallest bar while the label divided by requests
                          sent, so the picture and the number disagreed. */}
                      <div
                        className={`review-bar-fill${bar.rating >= 4 ? ' is-good' : ' is-low'}`}
                        style={{ width: `${bar.pct}%` }}
                      />
                    </div>
                    <span className="review-bar-count">
                      {bar.count} · {bar.pct}%
                    </span>
                  </div>
                ))}
                <p className="workspace-metric-note">
                  Share of the {kpis.rated} rating{kpis.rated === 1 ? '' : 's'} received — not of the{' '}
                  {kpis.sent} request{kpis.sent === 1 ? '' : 's'} sent.
                </p>
              </div>
            )}

            <div className="section-heading workspace-section-heading compact-heading" style={{ marginTop: '1.25rem' }}>
              <p className="eyebrow">Sent vs responded</p>
            </div>
            {trend.length === 0 ? (
              <p className="empty-state">
                Nothing was sent in this period, so there is no trend to draw.
              </p>
            ) : (
              <>
                <div className={styles.trend} role="img" aria-label={trendLabel(trend)}>
                  {trend.map((bucket) => {
                    const peak = Math.max(1, ...trend.map((b) => b.sent));
                    return (
                      <div key={bucket.label} className={styles.trendCol}>
                        <div
                          className={`${styles.trendBar} ${styles.trendBarResponded}`}
                          style={{ height: `${(bucket.responded / peak) * 100}%` }}
                        />
                        <div
                          className={styles.trendBar}
                          style={{ height: `${((bucket.sent - bucket.responded) / peak) * 100}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className={styles.trendLabels} aria-hidden="true">
                  {trend.map((bucket) => (
                    <span key={bucket.label}>{bucket.label.slice(5)}</span>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ---- activity ------------------------------------------------- */}
          <section className="panel workspace-section-card" aria-labelledby="review-activity-title">
            <div className="section-heading workspace-section-heading compact-heading">
              <h2 className="eyebrow" id="review-activity-title">
                Review request activity
              </h2>
            </div>

            <ul className={styles.tabs}>
              {ACTIVITY_TABS.map((name) => (
                <li key={name}>
                  <Link
                    className={`${styles.tab}${tab === name ? ` ${styles.tabOn}` : ''}`}
                    href={hrefWith(reviewsPath, params, { tab: name === 'all' ? null : name })}
                    aria-current={tab === name ? 'page' : undefined}
                  >
                    {ACTIVITY_TAB_LABEL[name]}
                    <span className={styles.tabCount}>{counts[name]}</span>
                  </Link>
                </li>
              ))}
            </ul>

            {visible.length === 0 ? (
              <p className="empty-state">
                No review requests match these filters. {counts.all === 0 ? 'Try a wider date range.' : 'Try clearing the search or status.'}
              </p>
            ) : (
              <>
                <div className={`${styles.tableWrap} ${styles.desktopOnly}`} tabIndex={0} role="region" aria-label="Review requests, scrollable">
                  <table className={styles.table}>
                    <caption>
                      {visible.length} request{visible.length === 1 ? '' : 's'} · {DATE_RANGE_LABEL[filters.range]}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Customer</th>
                        <th scope="col">Job</th>
                        <th scope="col">Sent</th>
                        <th scope="col">Channel</th>
                        <th scope="col">Status</th>
                        <th scope="col">Rating</th>
                        <th scope="col">Responded</th>
                        <th scope="col">Reminders</th>
                        <th scope="col">Feedback</th>
                        <th scope="col">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} className={row.feedback && !row.resolvedAt ? styles.needsYou : undefined}>
                          <th scope="row" style={{ fontWeight: 600 }}>
                            {row.clientName || 'A customer'}
                          </th>
                          <td>
                            {row.jobId ? (
                              <Link className={styles.inlineLink} href={`${basePath}/jobs/${row.jobId}`}>
                                {row.jobRef || 'Open job'}
                              </Link>
                            ) : (
                              <span className={styles.quiet}>—</span>
                            )}
                          </td>
                          <td className={styles.num}>{formatDate(row.sentAt)}</td>
                          <td className={styles.quiet}>{CHANNEL_LABEL[row.channel]}</td>
                          <td>
                            <span className={`status-badge ${TONE_CLASS[REQUEST_STATUS_TONE[row.status]]}`}>
                              {REQUEST_STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td className={styles.num}>
                            {row.rating !== null ? (
                              <>
                                <span aria-hidden="true">{stars(row.rating)}</span>
                                <span className="sr-only">{row.rating} of 5</span>
                              </>
                            ) : (
                              <span className={styles.quiet}>—</span>
                            )}
                          </td>
                          <td className={styles.num}>{formatDate(row.respondedAt)}</td>
                          <td className={styles.num}>
                            {row.remindersSent}
                            {row.remindersStoppedAt ? <span className={styles.quiet}> · stopped</span> : null}
                          </td>
                          <td className={styles.wrapCell}>
                            {row.feedback ? (
                              <>
                                {row.feedback.length > 80 ? `${row.feedback.slice(0, 80)}…` : row.feedback}
                                {row.resolvedAt ? <span className={styles.quiet}> · resolved</span> : null}
                              </>
                            ) : (
                              <span className={styles.quiet}>—</span>
                            )}
                          </td>
                          <td>
                            <Link
                              className={styles.inlineLink}
                              href={hrefWith(reviewsPath, params, { tab: tab === 'all' ? null : tab, open: row.id })}
                            >
                              Details
                              <span className="sr-only"> for {row.clientName || 'this customer'}</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ten columns do not fit a phone. Same rows, as cards. */}
                <ul className={`${styles.cardList} ${styles.phoneOnly}`}>
                  {visible.map((row) => (
                    <li key={row.id}>
                      <article className={styles.rowCard}>
                        <div className={styles.rowCardTop}>
                          <span className={styles.rowCardName}>{row.clientName || 'A customer'}</span>
                          <span className={`status-badge ${TONE_CLASS[REQUEST_STATUS_TONE[row.status]]}`}>
                            {REQUEST_STATUS_LABEL[row.status]}
                          </span>
                        </div>
                        <div className={styles.rowCardMeta}>
                          <span>{formatDate(row.sentAt)}</span>
                          <span>{CHANNEL_LABEL[row.channel]}</span>
                          {row.rating !== null ? (
                            <span>
                              <span aria-hidden="true">{stars(row.rating)}</span>
                              <span className="sr-only">{row.rating} of 5</span>
                            </span>
                          ) : null}
                          {row.remindersSent > 0 ? <span>{row.remindersSent} reminder{row.remindersSent === 1 ? '' : 's'}</span> : null}
                        </div>
                        {row.feedback ? <p className={styles.quiet}>{row.feedback}</p> : null}
                        <div className={styles.actionRow}>
                          <Link
                            className="btn secondary"
                            href={hrefWith(reviewsPath, params, { tab: tab === 'all' ? null : tab, open: row.id })}
                          >
                            Details
                            <span className="sr-only"> for {row.clientName || 'this customer'}</span>
                          </Link>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* ---- private feedback ---------------------------------------- */}
          <section className="panel workspace-section-card" aria-labelledby="review-private-title">
            <div className="section-heading workspace-section-heading compact-heading">
              <h2 className="eyebrow" id="review-private-title">
                Private feedback{privateRows.length > 0 ? ` · ${privateRows.length}` : ''}
              </h2>
            </div>
            {privateRows.length === 0 ? (
              <p className="empty-state">
                No private feedback in this period. Anyone who&apos;d rather tell you directly than
                post publicly lands here.
              </p>
            ) : (
              <div className="review-feedback-list">
                {privateRows.map((row) => (
                  <div key={row.id} className="review-feedback-card">
                    <div className="review-feedback-top">
                      <span className="review-feedback-stars">
                        <span aria-hidden="true">{stars(row.rating)}</span>
                        {row.rating !== null ? <span className="sr-only">{row.rating} of 5</span> : null}
                      </span>
                      <span className="review-feedback-meta">
                        {row.clientName || 'A client'} · {formatDate(row.feedbackAt ?? row.respondedAt)}
                        {row.resolvedAt ? ' · resolved' : ''}
                        {' · '}
                        <Link
                          className={styles.inlineLink}
                          href={hrefWith(reviewsPath, params, { tab: tab === 'all' ? null : tab, open: row.id })}
                        >
                          Open<span className="sr-only"> details for {row.clientName || 'this customer'}</span>
                        </Link>
                      </span>
                    </div>
                    <p className="review-feedback-body">{row.feedback}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Suspense fallback={null}>
        <ReviewDrawer row={openRow} basePath={basePath} nowIso={nowIso} readOnly={readOnly} />
      </Suspense>
    </main>
  );
}

/** The trend, as one sentence, for anyone who cannot see the bars. */
function trendLabel(trend: { label: string; sent: number; responded: number }[]): string {
  const sent = trend.reduce((total, bucket) => total + bucket.sent, 0);
  const responded = trend.reduce((total, bucket) => total + bucket.responded, 0);
  return `Requests sent versus responded over ${trend.length} periods: ${sent} sent, ${responded} responded.`;
}

export type { ActivityTab };
