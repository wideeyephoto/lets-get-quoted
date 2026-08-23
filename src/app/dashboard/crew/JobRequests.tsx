import Link from 'next/link';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  SELECTION_MODE_LABEL,
  formatPay,
  formatTimeRemaining,
  requestDisplayStatus,
  requestProgress,
  scheduleLabel,
} from '@/lib/subcontractor-dispatch';
import { formatResponseTime } from '@/lib/subcontractors';
import type { RequestWithOffers } from '@/lib/subcontractor-dispatch-data';
import styles from './dispatch.module.css';

/**
 * Job requests — one ask per row, and the four numbers above them.
 *
 * A SERVER COMPONENT with no state of its own. Everything on this tab is
 * derived: the statuses come from requestDisplayStatus rather than the stored
 * column, the countdowns from requestProgress. Nothing here needs to be
 * refreshed by a cron or corrected by a click, which is why there is no
 * client-side timer either — a page that says "3h 20m left" and re-renders on
 * navigation is honest; one that counts down in the browser while the server's
 * answer drifts is not.
 */

export type RequestsSummary = {
  openRequests: number;
  filledThisMonth: number;
  responseMinutes: number | null;
  responseRate: number | null;
};

/**
 * The four cards, computed from every request this account has ever sent.
 *
 * Exported and pure so the numbers on this tab and the numbers a test asserts
 * are produced by the same arithmetic.
 */
export function summarizeRequests(entries: RequestWithOffers[], now: Date = new Date()): RequestsSummary {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  let open = 0;
  let filled = 0;
  const responseTimes: number[] = [];
  let answerable = 0;
  let answered = 0;

  for (const entry of entries) {
    const status = requestDisplayStatus(entry.request, entry.offers, now);
    if (status === 'queued' || status === 'sent' || status === 'viewed' || status === 'partially_responded' || status === 'reopened') open += 1;
    if (entry.request.status === 'claimed' && (entry.request.claimedAt ?? '') >= monthStart) filled += 1;

    for (const offer of entry.offers) {
      if (!offer.sentAt && !['sent', 'delivered', 'viewed', 'accepted', 'declined', 'covered'].includes(offer.status)) continue;
      answerable += 1;
      if (offer.respondedAt) {
        answered += 1;
        if (offer.sentAt) {
          const minutes = (new Date(offer.respondedAt).getTime() - new Date(offer.sentAt).getTime()) / 60000;
          if (Number.isFinite(minutes) && minutes >= 0) responseTimes.push(minutes);
        }
      }
    }
  }

  // The median again, for the reason set out in lib/subcontractors: one sub who
  // answered the next morning must not be allowed to describe the other four.
  const sorted = responseTimes.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const responseMinutes =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2);

  return {
    openRequests: open,
    filledThisMonth: filled,
    responseMinutes,
    responseRate: answerable > 0 ? answered / answerable : null,
  };
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={styles.chip} data-tone={tone}>
      {children}
    </span>
  );
}

export default function JobRequests({
  entries,
  assignableJobs,
  subcontractorCount,
  simulated,
}: {
  entries: RequestWithOffers[];
  assignableJobs: Array<{ id: string; ref: string; clientName: string }>;
  subcontractorCount: number;
  /** True when this environment cannot actually text anybody. */
  simulated: boolean;
}) {
  const now = new Date();
  const summary = summarizeRequests(entries, now);

  return (
    <section aria-labelledby="job-requests-heading">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Dispatch</p>
        <h2 id="job-requests-heading">Job requests</h2>
      </div>

      {simulated ? (
        <p className={styles.simNotice} role="status">
          <strong>Texts are simulated here.</strong> This environment has no messaging provider, so offers are created
          and their links work — but nothing is delivered to a real phone.
        </p>
      ) : null}

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard} data-tone={summary.openRequests > 0 ? 'alert' : undefined}>
          <span className={styles.summaryValue}>{summary.openRequests}</span>
          <span className={styles.summaryLabel}>Open requests</span>
          <span className={styles.summaryHint}>
            {summary.openRequests === 0 ? 'Nothing waiting on cover' : 'Still waiting on an answer'}
          </span>
        </div>
        <div className={styles.summaryCard} data-tone={summary.filledThisMonth > 0 ? 'ok' : undefined}>
          <span className={styles.summaryValue}>{summary.filledThisMonth}</span>
          <span className={styles.summaryLabel}>Jobs filled</span>
          <span className={styles.summaryHint}>This month</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{formatResponseTime(summary.responseMinutes)}</span>
          <span className={styles.summaryLabel}>Average response</span>
          <span className={styles.summaryHint}>Median across your subs</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>
            {summary.responseRate === null ? '—' : `${Math.round(summary.responseRate * 100)}%`}
          </span>
          <span className={styles.summaryLabel}>Response rate</span>
          <span className={styles.summaryHint}>Offers that got an answer</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No job requests yet</h3>
          <p>
            Put one job to several subcontractors at once. Everybody gets their own private link, and the first
            qualified acceptance takes the job — every other offer closes itself.
          </p>
          {subcontractorCount === 0 ? (
            <>
              <p>Add a subcontractor first, then you can offer one job to several qualified firms at once.</p>
              <Link href="/dashboard/crew?tab=people&add=sub" className="btn primary">
                + Add subcontractor
              </Link>
            </>
          ) : assignableJobs.length === 0 ? (
            <p>There are no open jobs to request cover for.</p>
          ) : (
            <Link href="/dashboard/crew/requests/new" className="btn primary">
              Create a job request
            </Link>
          )}
        </div>
      ) : (
        <ul className={styles.requestList}>
          {entries.map((entry) => {
            const status = requestDisplayStatus(entry.request, entry.offers, now);
            const progress = requestProgress(entry.request, entry.offers, now);
            const winner = entry.offers.find((offer) => offer.won);
            const when = scheduleLabel(entry.request);
            return (
              <li key={entry.request.id} className={styles.requestCard}>
                <div className={styles.requestHead}>
                  <h3 className={styles.requestTitle}>
                    <Link href={`/dashboard/crew/requests/${entry.request.id}`}>{entry.request.workDescription}</Link>
                  </h3>
                  <Chip tone={REQUEST_STATUS_TONE[status]}>{REQUEST_STATUS_LABEL[status]}</Chip>
                  {status === 'claimed' && winner ? <Chip tone="ok">{winner.displayName}</Chip> : null}
                </div>

                <p className={styles.requestMeta}>
                  {entry.job ? (
                    <Link href={`/dashboard/jobs/${entry.job.id}`}>{entry.job.ref}</Link>
                  ) : (
                    <span>Job removed</span>
                  )}
                  <span>{entry.request.generalLocation}</span>
                  {when ? <span>{when}</span> : null}
                  <span>{formatPay(entry.request.payAmount, entry.request.payKind)}</span>
                  <span>{SELECTION_MODE_LABEL[entry.request.selectionMode]}</span>
                </p>

                <p className={styles.requestCounts}>
                  <span>
                    <strong>{progress.queued}</strong> queued
                  </span>
                  <span>
                    <strong>{progress.carrierAccepted}</strong> carrier accepted
                  </span>
                  <span>
                    <strong>{progress.viewed}</strong> viewed
                  </span>
                  <span>
                    <strong>{progress.declined}</strong> declined
                  </span>
                  {progress.failed > 0 ? (
                    <span>
                      <strong>{progress.failed}</strong> failed
                    </span>
                  ) : null}
                  <span>{formatTimeRemaining(progress.minutesRemaining)}</span>
                </p>

                <div className={styles.requestActions}>
                  <Link href={`/dashboard/crew/requests/${entry.request.id}`} className="btn secondary">
                    Open request
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
