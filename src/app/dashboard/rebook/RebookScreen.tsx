import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { REBOOK_DAY_OPTIONS, type RebookCandidate } from '@/lib/rebook';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { sendRebookInviteAction, sendAllRebookInvitesAction } from './actions';

/**
 * Past customers due to be asked again, given the list.
 *
 * Split out of page.tsx so the logged-out demo renders the same screen — see the
 * note on CampaignsScreen.
 *
 * Under readOnly the send buttons are replaced by the REASON each customer is or
 * is not reachable, rather than removed outright. That is the substance of the
 * page: a book of past customers, sorted by silence, each annotated with whether
 * you can actually reach them. A prospect should see that, and should not see a
 * "Send booking link" button that ends at a login wall.
 */

function agoLabel(days: number): string {
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RebookScreen({
  candidates,
  bookingUrl,
  days,
  flashText = null,
  flashError = null,
  basePath = '/dashboard',
  readOnly = false,
}: {
  candidates: RebookCandidate[];
  bookingUrl: string | null;
  days: number;
  flashText?: string | null;
  flashError?: string | null;
  basePath?: string;
  readOnly?: boolean;
}) {
  const reachable = candidates.filter((c) => c.smsReady || c.hasEmail);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Book again</p>
          <h1 className="workspace-title">Win back past customers</h1>
          <p className="workspace-lead">
            These are customers you&apos;ve worked with before who haven&apos;t booked in a while. Send them your booking
            link in a tap — texting opted-in mobiles, emailing the rest — and turn a finished job into the next one.
          </p>
          {/* This page has no row in the rail any more — it is reached from
              Marketing — so it carries the way back itself rather than leaving
              you on a page nothing in the sidebar is lit for. */}
          <p className="workspace-lead">
            <Link href={`${basePath}/marketing`}>← Back to Marketing</Link>
          </p>
        </div>
      </section>

      {flashText ? (
        <section className="panel workspace-section-card flash-banner flash-success"><p>{flashText}</p></section>
      ) : null}
      {flashError ? (
        <section className="panel workspace-section-card flash-banner flash-warn"><p>{flashError}</p></section>
      ) : null}

      {!bookingUrl ? (
        <section className="panel workspace-section-card flash-banner flash-info">
          <p>
            Your booking page isn&apos;t published yet, so there&apos;s no link to send. Publish it from your{' '}
            <Link href={`${basePath}/sites`}>website builder</Link> and then come back to invite past customers.
          </p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading rebook-heading">
          <p className="eyebrow">Due to rebook · no job in</p>
          <div className="status-tabs workspace-status-tabs">
            {REBOOK_DAY_OPTIONS.map((option) => (
              <Link key={option} href={`${basePath}/rebook?days=${option}`} className={`status-tab${days === option ? ' active' : ''}`}>
                {option}+ days
              </Link>
            ))}
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className="empty-state">No past customers are {days}+ days overdue right now. Try a shorter window above, or check back later.</p>
        ) : (
          <>
            {bookingUrl && reachable.length > 0 ? (
              <div className="rebook-bulk">
                <span>{reachable.length} reachable of {candidates.length} due</span>
                {readOnly ? null : (
                  <ConfirmActionButton
                    action={sendAllRebookInvitesAction.bind(null, days)}
                    confirmMessage={`Send your booking link to all reachable customers ${days}+ days overdue? (Anyone invited in the last 2 weeks is skipped.)`}
                    className="btn primary"
                    pendingLabel="Sending…"
                    savedLabel="Sent ✓"
                  >
                    Send to all reachable
                  </ConfirmActionButton>
                )}
              </div>
            ) : null}

            <div className="rebook-list">
              {candidates.map((candidate) => {
                const canSend = bookingUrl && (candidate.smsReady || candidate.hasEmail);
                return (
                  <div key={candidate.id} className="rebook-row">
                    <div className="rebook-row-main">
                      <div className="rebook-row-head">
                        <Link href={`${basePath}/clients/${candidate.id}`} className="rebook-name">{candidate.name}</Link>
                        <span className="rebook-ago">Last job {agoLabel(candidate.daysSince)}</span>
                      </div>
                      <p className="rebook-row-meta">
                        {candidate.jobCount} job{candidate.jobCount === 1 ? '' : 's'} · {formatMoney(candidate.totalValue)} lifetime
                        {candidate.smsReady ? ` · 📱 ${candidate.phone ? formatPhoneDashes(candidate.phone) : 'textable'}` : candidate.hasEmail ? ' · ✉️ email' : ' · no contact on file'}
                        {candidate.invitedAt ? ` · invited ${shortDate(candidate.invitedAt)}` : ''}
                      </p>
                    </div>
                    <div className="rebook-row-actions">
                      {readOnly ? (
                        <span className="rebook-cant">
                          {canSend ? (candidate.smsReady ? 'Textable' : 'Emailable') : !bookingUrl ? 'Publish booking page' : 'No contact on file'}
                        </span>
                      ) : canSend ? (
                        <form action={sendRebookInviteAction.bind(null, candidate.id, days)}>
                          <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Sent ✓">Send booking link</SaveButton>
                        </form>
                      ) : (
                        <span className="rebook-cant">{!bookingUrl ? 'Publish booking page' : 'No contact on file'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
