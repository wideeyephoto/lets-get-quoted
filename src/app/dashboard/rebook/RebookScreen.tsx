import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { REBOOK_DAY_OPTIONS, type RebookCandidate } from '@/lib/rebook';
import {
  REBOOK_CHANNEL_LABEL,
  previewFirstName,
  rebookBlockReason,
  rebookChannelFor,
  rebookInviteEmailContent,
  rebookReachSplit,
} from '@/lib/rebook-message';
import { rebookInviteText } from '@/lib/sms-templates';
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
  businessName = 'Your company',
  mailingAddress = null,
  flashText = null,
  flashError = null,
  basePath = '/dashboard',
  readOnly = false,
}: {
  candidates: RebookCandidate[];
  bookingUrl: string | null;
  days: number;
  /** Whose name is on the message. Needed to preview it truthfully. */
  businessName?: string;
  /**
   * The business's postal address. Absent, the EMAIL half of this page does not
   * work at all — a marketing email must carry one, so deliverRebookInvite
   * refuses to send it. The page used to look identical either way.
   */
  mailingAddress?: string | null;
  flashText?: string | null;
  flashError?: string | null;
  basePath?: string;
  readOnly?: boolean;
}) {
  const context = { bookingUrl, mailingAddress };
  const split = rebookReachSplit(candidates, context);
  const reachable = candidates.filter((candidate) => rebookChannelFor(candidate, context) !== 'none');
  // Greeted by a real first name where there is one — a preview headed
  // "there, it has been a while!" is a preview of a bug.
  const sampleName = previewFirstName(candidates[0]?.name);
  const email = rebookInviteEmailContent({ businessName, clientName: sampleName });
  const smsBody = rebookInviteText({
    businessName,
    clientName: sampleName,
    url: bookingUrl ?? 'https://yourname.letsgetquoted.com/book',
  });

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

      {/* WHAT THEY ACTUALLY GET, before anybody presses send.
          The page offered one button to every past customer and showed neither
          the message nor which way it leaves. They are two different messages
          with two different sets of rules — a text carries an opt-out, a
          marketing email carries a postal address — and the copy here comes
          from the same functions the senders use, so it cannot drift. */}
      <section className="panel workspace-section-card rebook-preview">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">What gets sent</p>
          <h2>Your win-back message</h2>
        </div>
        <p className="workspace-details-copy rebook-preview-lead">
          Everyone with an opted-in mobile gets the text. Everyone else with an email gets the email. Nothing here is
          editable yet — this is the message as it goes out.
        </p>

        <div className="rebook-preview-grid">
          <article className="rebook-preview-card">
            <div className="rebook-preview-head">
              <span className="rebook-channel-chip is-sms">Text</span>
              <strong>{split.sms} customer{split.sms === 1 ? '' : 's'}</strong>
            </div>
            <p className="rebook-sms-body">{smsBody}</p>
            <small>
              Sent only to mobiles with an opted-in consent record. The link and the STOP line are both required — the
              first is the point, the second is the law.
            </small>
          </article>

          <article className={`rebook-preview-card${!mailingAddress ? ' is-blocked' : ''}`}>
            <div className="rebook-preview-head">
              <span className="rebook-channel-chip is-email">Email</span>
              <strong>{split.email} customer{split.email === 1 ? '' : 's'}</strong>
            </div>
            <dl className="rebook-email-body">
              <div>
                <dt>Subject</dt>
                <dd>{email.subject}</dd>
              </div>
              <div>
                <dt>Heading</dt>
                <dd>{email.heading}</dd>
              </div>
              <div>
                <dt>Body</dt>
                <dd>{email.paragraphs.join(' ')}</dd>
              </div>
              <div>
                <dt>Button</dt>
                <dd>{email.ctaLabel}</dd>
              </div>
            </dl>
            {mailingAddress ? (
              <small>
                Your unsubscribe link and postal address are added to the footer — they are what makes a marketing email
                lawful to send. Currently {mailingAddress}.
              </small>
            ) : (
              /* Not a warning about a preference. Without this the email path is
                 not merely unattractive: deliverRebookInvite refuses it, and the
                 send comes back saying the customer has no reachable email —
                 which is not what was wrong. */
              <small className="rebook-preview-block">
                <strong>No email can go out yet.</strong> A marketing email has to carry your business&apos;s postal
                address, and there isn&apos;t one on file — so every email customer below is skipped.{' '}
                <Link href={`${basePath}/settings`}>Add your mailing address →</Link>
              </small>
            )}
          </article>
        </div>
      </section>

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
                <span>
                  {reachable.length} reachable of {candidates.length} due
                  {/* Which way, not just how many. "12 reachable" over a book
                      that is 11 emails and one text is a different afternoon
                      from the reverse. */}
                  {split.sms > 0 || split.email > 0 ? (
                    <small> · {split.sms} by text, {split.email} by email</small>
                  ) : null}
                </span>
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
                // The same rule the sender uses, so the row cannot promise a
                // channel that deliverRebookInvite will decline.
                const channel = rebookChannelFor(candidate, context);
                const blocked = rebookBlockReason(candidate, context);
                const destination =
                  channel === 'sms'
                    ? candidate.phone
                      ? formatPhoneDashes(candidate.phone)
                      : 'their mobile'
                    : channel === 'email'
                      ? candidate.email ?? 'their email'
                      : null;
                return (
                  <div key={candidate.id} className="rebook-row">
                    <div className="rebook-row-main">
                      <div className="rebook-row-head">
                        <Link href={`${basePath}/clients/${candidate.id}`} className="rebook-name">{candidate.name}</Link>
                        {/* The channel as its own thing, because it decides
                            which of two messages this customer receives. */}
                        <span className={`rebook-channel-chip is-${channel}`}>{REBOOK_CHANNEL_LABEL[channel]}</span>
                        <span className="rebook-ago">Last job {agoLabel(candidate.daysSince)}</span>
                      </div>
                      <p className="rebook-row-meta">
                        {candidate.jobCount} job{candidate.jobCount === 1 ? '' : 's'} · {formatMoney(candidate.totalValue)} lifetime
                        {destination ? ` · ${destination}` : ''}
                        {candidate.invitedAt ? ` · invited ${shortDate(candidate.invitedAt)}` : ''}
                      </p>
                    </div>
                    <div className="rebook-row-actions">
                      {readOnly ? (
                        <span className="rebook-cant">{blocked ?? `${REBOOK_CHANNEL_LABEL[channel]}able`}</span>
                      ) : channel !== 'none' ? (
                        <form action={sendRebookInviteAction.bind(null, candidate.id, days)}>
                          {/* Names the channel it will use. One label for both
                              was the whole complaint: the button gave no clue
                              which message this customer was about to get. */}
                          <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Sent ✓">
                            {channel === 'sms' ? 'Text booking link' : 'Email booking link'}
                          </SaveButton>
                        </form>
                      ) : (
                        <span className="rebook-cant">{blocked}</span>
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
