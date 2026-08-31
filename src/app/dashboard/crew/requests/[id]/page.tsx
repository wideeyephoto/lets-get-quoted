import Link from 'next/link';
import { notFound } from 'next/navigation';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { requireOfficeContext } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { coordOf } from '@/lib/distance';
import { getJob } from '@/lib/jobs';
import { isLiveMessagingEnvironment } from '@/lib/sms';
import { getSubcontractorRequest, loadMatches, todayIn } from '@/lib/subcontractor-dispatch-data';
import {
  OFFER_STATUS_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  SELECTION_MODE_LABEL,
  draftOfferMessage,
  expiryLabel,
  formatPay,
  formatTimeRemaining,
  requestDisplayStatus,
  requestProgress,
  requirementLines,
  scheduleLabel,
} from '@/lib/subcontractor-dispatch';
import { SUB_STATUS_LABEL } from '@/lib/subcontractors';
import { cancelRequestAction, chooseSubcontractorAction, reopenRequestAction, sendRequestAction } from '../../subcontractor-actions';
import RecipientPicker, { type Recipient } from './RecipientPicker';
import styles from '../../dispatch.module.css';

export const metadata = { title: 'Subcontractor request' };

// One request: what was asked, who was asked, and where every one of them got to.
//
// Two states, one page. Before anything is sent it is the composer's second half
// — the match list and the message. Afterwards it is the tracker. They are the
// same page rather than two because the question an owner has in both states is
// the same one ("is this covered?"), and because a request that was sent to
// three firms and needs a fourth has to be able to become the composer again.

export const dynamic = 'force-dynamic';

const OFFER_TONE: Record<string, string> = {
  queued: 'muted',
  sent: 'info',
  delivered: 'info',
  viewed: 'info',
  accepted: 'ok',
  declined: 'muted',
  covered: 'muted',
  expired: 'alert',
  failed: 'alert',
};

const COMPLIANCE_TONE: Record<string, string> = {
  ok: 'ok',
  expiring: 'warn',
  expired: 'alert',
  missing: 'warn',
};

function timeOf(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function SubcontractorRequestPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queued?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, accountId } = await requireOfficeContext('crew.read');
  const detail = await getSubcontractorRequest(supabase, accountId, params.id);
  if (!detail) notFound();

  const { request, offers, job } = detail;
  const now = new Date();
  const status = requestDisplayStatus(request, offers, now);
  const progress = requestProgress(request, offers, now);
  const winner = offers.find((offer) => offer.won) ?? null;
  const when = scheduleLabel(request);
  const businessName = await loadBusinessName(supabase, accountId);

  // The composer half is only worth building while more offers could still go
  // out — a claimed or cancelled request has nobody left to ask.
  const canSend = status !== 'claimed' && status !== 'cancelled';

  const fullJob = job ? await getJob(supabase, accountId, job.id) : null;
  const matches = canSend
    ? await loadMatches(
        supabase,
        accountId,
        {
          requiredTrade: request.requiredTrade,
          requiredSkills: request.requiredSkills,
          requiresLicense: request.requiresLicense,
          requiresInsurance: request.requiresInsurance,
          serviceDate: request.serviceDate,
          jobId: request.jobId,
          jobCoord: fullJob ? coordOf(fullJob) : null,
        },
        { today: todayIn(null) },
      )
    : [];

  const offeredCrewIds = new Set(offers.map((offer) => offer.crewId));

  const recipients: Recipient[] = matches.map((match) => ({
    crewId: match.candidate.crewId,
    name: match.candidate.name,
    companyName: match.candidate.companyName,
    displayName: match.candidate.companyName || match.candidate.name,
    trades: match.candidate.trades,
    distanceLabel: match.distanceMiles === null ? 'Distance unknown' : `${match.distanceMiles} mi away`,
    availability:
      match.candidate.conflicts.length > 0
        ? `On ${match.candidate.conflicts.join(', ')} that day`
        : match.candidate.availabilityNote || 'Available',
    ratingLabel:
      match.candidate.metrics.rating === null
        ? 'Not rated yet'
        : `${match.candidate.metrics.rating.toFixed(1)} internal rating`,
    completed: match.candidate.metrics.completed,
    complianceLabel: match.candidate.compliance.label,
    complianceTone: COMPLIANCE_TONE[match.candidate.compliance.overall] ?? 'muted',
    subStatus: match.candidate.subStatus === 'active' ? null : SUB_STATUS_LABEL[match.candidate.subStatus],
    reasons: match.reasons,
    blockers: match.blockers,
    eligible: match.eligible,
    recommended: match.recommended && !offeredCrewIds.has(match.candidate.crewId),
    alreadyOffered: offeredCrewIds.has(match.candidate.crewId),
  }));

  const defaultMessage =
    request.messageBody ||
    draftOfferMessage({
      businessName,
      workDescription: request.workDescription,
      generalLocation: request.generalLocation,
      whenLabel: when,
      payAmount: request.payAmount,
      payKind: request.payKind,
      expiresLabel: expiryLabel(request.expiresAt, now),
    });

  const queuedCount = Number(searchParams.queued ?? '');

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Job request</p>
          <h1>{request.workDescription}</h1>
        </div>

        <p className={styles.requestMeta}>
          {job ? <Link href={`/dashboard/jobs/${job.id}`}>{job.ref} · {job.clientName}</Link> : <span>Job removed</span>}
          <span>{request.generalLocation}</span>
          {when ? <span>{when}</span> : null}
          <span>{formatPay(request.payAmount, request.payKind)}</span>
          <span className={styles.chip} data-tone={REQUEST_STATUS_TONE[status]}>
            {REQUEST_STATUS_LABEL[status]}
          </span>
        </p>

        {Number.isFinite(queuedCount) && queuedCount > 0 ? (
          <p className={styles.simNotice} role="status">
            {queuedCount} {queuedCount === 1 ? 'offer text is' : 'offer texts are'} queued.
            {!isLiveMessagingEnvironment()
              ? ' Texts are simulated in this environment, so nothing reached a real phone — the links below still work.'
              : ''}
          </p>
        ) : null}

        {winner ? (
          <div className={styles.claimedBanner}>
            <strong>{winner.displayName} took this job.</strong>
            <span>
              Accepted {timeOf(winner.respondedAt)}. They are assigned to {job?.ref ?? 'the job'} and every other offer
              has closed.
            </span>
            {job ? (
              <span>
                <Link href={`/dashboard/jobs/${job.id}`}>Open the job →</Link>
              </span>
            ) : null}
          </div>
        ) : null}

        <dl className={styles.summaryGrid} style={{ marginTop: '1.1rem' }}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{progress.queued}</span>
            <span className={styles.summaryLabel}>Texts queued</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{progress.carrierAccepted}</span>
            <span className={styles.summaryLabel}>Carrier accepted</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{progress.viewed}</span>
            <span className={styles.summaryLabel}>Viewed</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryValue}>{progress.declined}</span>
            <span className={styles.summaryLabel}>Declined</span>
          </div>
          <div className={styles.summaryCard} data-tone={progress.expired ? 'alert' : undefined}>
            <span className={styles.summaryValue}>{formatTimeRemaining(progress.minutesRemaining)}</span>
            <span className={styles.summaryLabel}>Time remaining</span>
            <span className={styles.summaryHint}>{SELECTION_MODE_LABEL[request.selectionMode]}</span>
          </div>
        </dl>

        {requirementLines(request).length > 0 ? (
          <p className={styles.subChips}>
            {requirementLines(request).map((line) => (
              <span key={line} className={styles.chip}>
                {line}
              </span>
            ))}
          </p>
        ) : null}
      </section>

      {offers.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Offers</p>
            <h2>Who was asked, and what happened</h2>
          </div>

          <div className={styles.offerTableWrap}>
            <table className={styles.offerTable}>
              <caption className="sr-only">
                One row per subcontractor offered this job, with its delivery and response state.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Subcontractor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Viewed</th>
                  <th scope="col">Answered</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id} className={offer.won ? styles.offerWinner : undefined}>
                    <th scope="row">{offer.displayName}</th>
                    <td>
                      <span className={styles.chip} data-tone={OFFER_TONE[offer.status] ?? 'muted'}>
                        {OFFER_STATUS_LABEL[offer.status]}
                      </span>
                      {offer.backup ? (
                        <>
                          {' '}
                          <span className={styles.chip} data-tone="muted">
                            Backup
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>{timeOf(offer.sentAt)}</td>
                    <td>{timeOf(offer.viewedAt)}</td>
                    <td>{timeOf(offer.respondedAt)}</td>
                    <td>
                      {offer.question ? <div>Asked: “{offer.question}”</div> : null}
                      {offer.declineReason ? <div>{offer.declineReason}</div> : null}
                      {offer.errorReason ? <div>{offer.errorReason}</div> : null}
                      {/* Collect-interest mode: the owner is the one who picks,
                          so an accepted-but-not-won offer gets a button. */}
                      {request.selectionMode === 'collect_interest' &&
                      offer.status === 'accepted' &&
                      !offer.won &&
                      status !== 'claimed' ? (
                        <form action={chooseSubcontractorAction.bind(null, request.id, offer.id)}>
                          <SaveButton className="btn secondary" pendingLabel="Assigning…" savedLabel="Assigned ✓">
                            Give it to {offer.displayName}
                          </SaveButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canSend ? (
        <section className="panel workspace-section-card">
          {recipients.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>No subcontractors to offer this to</h2>
              <p>
                Nobody on your list works {request.requiredTrade || 'this trade'} yet. Add a firm, or edit an existing
                one to include it.
              </p>
              <Link href="/dashboard/crew?tab=people&add=sub" className="btn primary">
                + Add subcontractor
              </Link>
            </div>
          ) : (
            <RecipientPicker
              recipients={recipients}
              defaultMessage={defaultMessage}
              action={sendRequestAction.bind(null, request.id)}
              sampleLink={`${process.env.NEXT_PUBLIC_APP_URL || 'https://letsgetquoted.com'}/sub/…`}
            />
          )}
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Manage</p>
          <h2>Cancel or reopen</h2>
        </div>

        {status === 'claimed' ? (
          <p className="empty-state">
            This request is settled. To change who is on the job, use the crew assignment on the job page.
          </p>
        ) : (
          <div className="form-grid">
            {status !== 'cancelled' ? (
              <div className="field full">
                <ConfirmActionButton
                  action={cancelRequestAction.bind(null, request.id)}
                  confirmMessage="Cancel this request? Every open offer closes and each subcontractor is told."
                  className="btn danger"
                  pendingLabel="Cancelling…"
                  savedLabel="Cancelled ✓"
                >
                  Cancel request
                </ConfirmActionButton>
              </div>
            ) : null}

            <form action={reopenRequestAction.bind(null, request.id)} className="field full form-grid">
              <div className="field">
                <label htmlFor="reopen-expires">New expiration</label>
                <input id="reopen-expires" name="expiresAt" type="datetime-local" required />
                <small className="field-hint">
                  A reopened request needs a new deadline — the old one has passed, and reopening onto it would expire
                  the moment it reopened.
                </small>
              </div>
              <div className="field">
                <SaveButton className="btn secondary" pendingLabel="Reopening…" savedLabel="Reopened ✓">
                  Reopen request
                </SaveButton>
              </div>
            </form>
          </div>
        )}
      </section>

      <p className={styles.formNote}>
        <Link href="/dashboard/crew?tab=requests">← Back to job requests</Link>
      </p>
    </main>
  );
}
