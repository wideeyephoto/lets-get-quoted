import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { listRebookCandidates, resolveRebookContext, REBOOK_DAY_OPTIONS, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { sendRebookInviteAction, sendAllRebookInvitesAction } from './actions';

function agoLabel(days: number): string {
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function RebookPage({
  searchParams,
}: {
  searchParams: { days?: string; flash?: string; msg?: string; sent?: string; skipped?: string; failed?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const requested = Number(searchParams.days);
  const days = REBOOK_DAY_OPTIONS.includes(requested) ? requested : DEFAULT_REBOOK_DAYS;

  const [{ bookingUrl }, candidates] = await Promise.all([
    resolveRebookContext(supabase, accountId),
    listRebookCandidates(supabase, accountId, days),
  ]);

  const reachable = candidates.filter((c) => c.smsReady || c.hasEmail);

  const flash = searchParams.flash ?? null;
  const flashText =
    flash === 'sent-sms'
      ? 'Booking link texted. It also shows in your Messages inbox.'
      : flash === 'sent-email'
        ? 'Booking link emailed.'
        : flash === 'batch'
          ? `Sent ${searchParams.sent ?? 0} booking link${Number(searchParams.sent) === 1 ? '' : 's'}.${Number(searchParams.skipped) > 0 ? ` ${searchParams.skipped} skipped (no contact).` : ''}${Number(searchParams.failed) > 0 ? ` ${searchParams.failed} failed.` : ''}`
          : null;
  const flashError = flash === 'error' ? (searchParams.msg ?? 'Could not send.') : null;

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
            <Link href="/dashboard/sites">website builder</Link> and then come back to invite past customers.
          </p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading rebook-heading">
          <p className="eyebrow">Due to rebook · no job in</p>
          <div className="status-tabs workspace-status-tabs">
            {REBOOK_DAY_OPTIONS.map((option) => (
              <Link key={option} href={`/dashboard/rebook?days=${option}`} className={`status-tab${days === option ? ' active' : ''}`}>
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
                <ConfirmActionButton
                  action={sendAllRebookInvitesAction.bind(null, days)}
                  confirmMessage={`Send your booking link to all reachable customers ${days}+ days overdue? (Anyone invited in the last 2 weeks is skipped.)`}
                  className="btn primary"
                  pendingLabel="Sending…"
                  savedLabel="Sent ✓"
                >
                  Send to all reachable
                </ConfirmActionButton>
              </div>
            ) : null}

            <div className="rebook-list">
              {candidates.map((candidate) => {
                const canSend = bookingUrl && (candidate.smsReady || candidate.hasEmail);
                return (
                  <div key={candidate.id} className="rebook-row">
                    <div className="rebook-row-main">
                      <div className="rebook-row-head">
                        <Link href={`/dashboard/clients/${candidate.id}`} className="rebook-name">{candidate.name}</Link>
                        <span className="rebook-ago">Last job {agoLabel(candidate.daysSince)}</span>
                      </div>
                      <p className="rebook-row-meta">
                        {candidate.jobCount} job{candidate.jobCount === 1 ? '' : 's'} · {formatMoney(candidate.totalValue)} lifetime
                        {candidate.smsReady ? ` · 📱 ${candidate.phone ? formatPhoneDashes(candidate.phone) : 'textable'}` : candidate.hasEmail ? ' · ✉️ email' : ' · no contact on file'}
                        {candidate.invitedAt ? ` · invited ${shortDate(candidate.invitedAt)}` : ''}
                      </p>
                    </div>
                    <div className="rebook-row-actions">
                      {canSend ? (
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
