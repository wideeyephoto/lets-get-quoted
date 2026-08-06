import Link from 'next/link';
import { AUDIENCE_DEFS } from '@/lib/campaign-audiences';
import type { MarketingPerformance } from '@/lib/insights-metrics';

// What marketing actually went out — the only marketing facts this product
// records. For each recent send: the channel, who it targeted, when it went, how
// many it reached, and how it delivered (email/text split, plus anything skipped
// or failed).
//
// Opens, clicks, replies and booked revenue are deliberately ABSENT: there is no
// tracking pixel, link wrapper or booking→campaign attribution anywhere, so a
// column for them would be a fabricated number — and an invented open rate is
// exactly the figure an owner would trust most. The engine carries two `false`
// flags for this; the card states the omission in words rather than leaving a
// blank an owner reads as zero. Server-only.

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'Text', both: 'Email + text' };

function audienceLabel(id: string): string {
  return AUDIENCE_DEFS.find((audience) => audience.id === id)?.label ?? id;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MarketingPerformanceCard({
  marketing,
  basePath = '/dashboard',
}: {
  marketing: MarketingPerformance;
  basePath?: string;
}) {
  // The demo's marketing area lives at /demo/campaigns rather than mirroring
  // /dashboard/marketing/campaigns, so the sub-path is resolved once here.
  const campaignsHref = basePath === '/dashboard' ? '/dashboard/marketing/campaigns' : `${basePath}/campaigns`;
  const { campaigns, totalRecipients, hasData } = marketing;

  return (
    <section className="panel ins-card ins-mkt-card">
      <p className="ins-card-head">
        <span className="ins-chip is-mkt" aria-hidden="true">✉</span> Marketing performance
      </p>

      {!hasData ? (
        <p className="ins-empty-note">
          Send a campaign from Marketing and each one — who it went to and how it delivered — is listed here.{' '}
          <Link className="ins-inline-link" href={campaignsHref}>Start a campaign →</Link>
        </p>
      ) : (
        <>
          <p className="ins-sub ins-mkt-summary">
            {campaigns.length} recent send{campaigns.length === 1 ? '' : 's'} · {totalRecipients.toLocaleString()}{' '}
            recipient{totalRecipients === 1 ? '' : 's'} reached
          </p>

          <ul className="ins-mkt-list">
            {campaigns.map((campaign) => {
              const sent = campaign.emailSent + campaign.smsSent;
              return (
                <li className="ins-mkt-row" key={campaign.id}>
                  <div className="ins-mkt-when">
                    <strong>{CHANNEL_LABEL[campaign.channel] ?? campaign.channel}</strong>
                    <span className="ins-sub">
                      {audienceLabel(campaign.audience)} · {formatDate(campaign.sentAt)}
                    </span>
                  </div>
                  <div className="ins-mkt-stats">
                    <span className="ins-mkt-stat">
                      <strong>{sent.toLocaleString()}</strong> sent
                    </span>
                    {campaign.emailSent > 0 && campaign.smsSent > 0 ? (
                      <span className="ins-mkt-muted">{campaign.emailSent} email · {campaign.smsSent} text</span>
                    ) : null}
                    {campaign.skipped > 0 ? <span className="ins-mkt-muted">{campaign.skipped} skipped</span> : null}
                    {campaign.failed > 0 ? <span className="ins-mkt-fail">{campaign.failed} failed</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="ins-sub ins-mkt-note">
            Opens, clicks, replies and booked revenue aren&apos;t tracked anywhere, so they&apos;re not shown —
            this is what was sent and how it delivered, not how it performed.
          </p>

          <div className="ins-card-foot">
            <span />
            <Link className="ins-inline-link" href={campaignsHref}>View all campaigns →</Link>
          </div>
        </>
      )}
    </section>
  );
}
