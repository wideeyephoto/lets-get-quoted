import Link from 'next/link';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from './ConfirmActionButton';
import { cancelRequestAction, reopenRequestAction } from '@/app/dashboard/crew/subcontractor-actions';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  formatPay,
  formatTimeRemaining,
  requestDisplayStatus,
  requestProgress,
  scheduleLabel,
} from '@/lib/subcontractor-dispatch';
import type { RequestWithOffers } from '@/lib/subcontractor-dispatch-data';
import styles from '@/app/dashboard/crew/dispatch.module.css';

/**
 * The subcontractor half of the job's crew section.
 *
 * WHY IT LIVES ON THE JOB PAGE at all: "who is doing this work" is one question,
 * and answering half of it here and half of it on another tab is how an owner
 * ends up assigning their own crew to a job a sub already accepted. So the
 * assignment checkboxes and this panel sit under one heading, and this one
 * carries the state that is actually moving — offers out, viewed, declined, time
 * left, who took it.
 *
 * Read-only apart from cancel and reopen. Creating a request is a different
 * screen because it needs the match list; this is the status of one that exists.
 */
export default function SubcontractorPanel({
  jobId,
  entry,
  canRequest,
  reason,
}: {
  jobId: string;
  /** The live (or most recent) request for this job. Null when there is none. */
  entry: RequestWithOffers | null;
  /** False when the account has no subcontractors to ask yet. */
  canRequest: boolean;
  /** Why requesting is unavailable, when it is. */
  reason?: string;
}) {
  if (!entry) {
    return (
      <div className={styles.jobPanel}>
        <p className="workspace-card-copy">
          Cannot cover this one yourself? Put it to several saved subcontractors at once — each gets their own private
          link, and the first qualified acceptance takes the job.
        </p>
        {canRequest ? (
          <div className={styles.requestActions}>
            <Link href={`/dashboard/crew/requests/new?job=${jobId}`} className="btn secondary">
              Request a subcontractor
            </Link>
          </div>
        ) : (
          <p className={styles.formNote}>
            {reason ?? 'Add a subcontractor to your directory first.'}{' '}
            <Link href="/dashboard/crew?tab=people&add=sub">Add one →</Link>
          </p>
        )}
      </div>
    );
  }

  const now = new Date();
  const { request, offers } = entry;
  const status = requestDisplayStatus(request, offers, now);
  const progress = requestProgress(request, offers, now);
  const winner = offers.find((offer) => offer.won) ?? null;
  const settled = status === 'claimed' || status === 'cancelled';

  return (
    <div className={styles.jobPanel}>
      <div className={styles.requestHead}>
        <h3 className={styles.requestTitle}>
          <Link href={`/dashboard/crew/requests/${request.id}`}>{request.workDescription}</Link>
        </h3>
        <span className={styles.chip} data-tone={REQUEST_STATUS_TONE[status]}>
          {REQUEST_STATUS_LABEL[status]}
        </span>
      </div>

      <p className={styles.requestMeta}>
        <span>{request.generalLocation}</span>
        {scheduleLabel(request) ? <span>{scheduleLabel(request)}</span> : null}
        <span>{formatPay(request.payAmount, request.payKind)}</span>
      </p>

      {winner ? (
        <p className={styles.jobPanelStats}>
          <span>
            Claimed by <strong>{winner.displayName}</strong>
          </span>
          <span>They are assigned to this job.</span>
        </p>
      ) : (
        <p className={styles.jobPanelStats}>
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
      )}

      <div className={styles.requestActions}>
        <Link href={`/dashboard/crew/requests/${request.id}`} className="btn secondary">
          Open request
        </Link>

        {!settled ? (
          <ConfirmActionButton
            action={cancelRequestAction.bind(null, request.id)}
            confirmMessage="Cancel this request? Every open offer closes and each subcontractor is told."
            className="btn ghost"
            pendingLabel="Cancelling…"
            savedLabel="Cancelled ✓"
          >
            Cancel request
          </ConfirmActionButton>
        ) : null}
      </div>

      {/* Reopening needs a new deadline, so it is a form rather than a button —
          see reopenSubcontractorRequest for why the old one cannot be reused. */}
      {status === 'expired' || status === 'cancelled' ? (
        <form action={reopenRequestAction.bind(null, request.id)} className="form-grid">
          <div className="field">
            <label htmlFor={`reopen-${request.id}`}>Reopen until</label>
            <input id={`reopen-${request.id}`} name="expiresAt" type="datetime-local" required />
          </div>
          <div className="field">
            <SaveButton className="btn secondary" pendingLabel="Reopening…" savedLabel="Reopened ✓">
              Reopen request
            </SaveButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
