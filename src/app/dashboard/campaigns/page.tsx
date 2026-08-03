import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { AUDIENCE_DEFS, listCampaigns, loadRecipients, matchesAudience, type Campaign } from '@/lib/campaigns';
import CampaignComposer from './CampaignComposer';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';
import { campaignDraftForBeat } from '@/lib/marketing-draft-data';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'Text', both: 'Email + text' };

function audienceLabel(id: string): string {
  return AUDIENCE_DEFS.find((audience) => audience.id === id)?.label ?? id;
}

function campaignSent(campaign: Campaign): number {
  return campaign.email_sent + campaign.sms_sent;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { sent?: string; recipients?: string; skipped?: string; failed?: string; test?: string; draft?: string };
  // `draft` is 'extra-stop' or 'beat:<id>'. Both are looked up server-side.
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [recipients, campaigns] = await Promise.all([
    loadRecipients(supabase, accountId),
    listCampaigns(supabase, accountId),
  ]);

  // Precompute reachable counts per audience × channel so the composer can show
  // live numbers without pulling any contact data into the client bundle.
  const now = Date.now();
  const reach = Object.fromEntries(
    AUDIENCE_DEFS.map((audience) => {
      const matched = recipients.filter((recipient) => matchesAudience(recipient, audience.id, now));
      return [
        audience.id,
        {
          total: matched.length,
          email: matched.filter((recipient) => recipient.emailReady).length,
          sms: matched.filter((recipient) => recipient.smsReady).length,
          either: matched.filter((recipient) => recipient.emailReady || recipient.smsReady).length,
        },
      ];
    }),
  );

  // A draft handed over from the Quick Stops page. Built here rather than
  // passed through the URL: the message depends on the account's fee band and
  // how far ahead it takes requests, and a querystring carrying prose is a
  // querystring somebody can rewrite.
  let draft: { channel: 'email' | 'sms' | 'both'; audience: string; subject: string; body: string } | undefined;
  if (searchParams.draft === 'extra-stop') {
    const [{ data: account }, { data: site }] = await Promise.all([
      supabase.from('accounts').select('business_name, extra_stop_min_fee_cents, extra_stop_days_ahead').eq('id', accountId).maybeSingle(),
      supabase.from('sites').select('published, subdomain, company_name').eq('account_id', accountId).maybeSingle(),
    ]);
    const origin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
    const pitch = buildQuickStopPitch({
      businessName: (site?.company_name as string) || (account as { business_name?: string } | null)?.business_name || 'us',
      bookingUrl: site?.published && site?.subdomain ? `${origin}/book/${site.subdomain}` : origin,
      minFeeCents: Number((account as { extra_stop_min_fee_cents?: number } | null)?.extra_stop_min_fee_cents) || 0,
      daysAhead: Number((account as { extra_stop_days_ahead?: number } | null)?.extra_stop_days_ahead ?? 1),
    });
    // Past customers, because they already know whether they liked the work.
    draft = { channel: 'email', audience: 'past', subject: pitch.subject, body: pitch.body };
  } else if (searchParams.draft?.startsWith('beat:')) {
    // A seasonal topic handed over from the marketing calendar. Written HERE
    // for the same reason as above — a querystring carrying prose is a
    // querystring somebody can rewrite, and this one would go out under the
    // contractor's name to their whole list.
    draft = await campaignDraftForBeat(supabase, accountId, searchParams.draft.slice('beat:'.length));
  }

  const sentCount = searchParams.sent ? Number(searchParams.sent) : null;
  const showResult = sentCount !== null;
  const showTestFlash = searchParams.test === '1';

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing</p>
          <h1 className="workspace-title">Reach past customers</h1>
          <p className="workspace-lead">
            Send a one-off email or text to the customers you&apos;ve already worked with — a seasonal offer, a
            &quot;we&apos;re booking again&quot; note, or a nudge to lapsed regulars. Texts go only to customers who opted in.
          </p>
        </div>
      </section>

      {showTestFlash ? (
        <section className="panel workspace-section-card flash-banner flash-info">
          <p>Test email sent to your inbox. Take a look, then send the real thing when it&apos;s ready.</p>
        </section>
      ) : null}

      {showResult ? (
        <section className="panel workspace-section-card flash-banner flash-success">
          <p>
            Campaign sent to <strong>{sentCount}</strong> {sentCount === 1 ? 'message' : 'messages'} across{' '}
            {searchParams.recipients ?? 0} {Number(searchParams.recipients) === 1 ? 'customer' : 'customers'}.
            {Number(searchParams.skipped) > 0 ? ` ${searchParams.skipped} skipped (not reachable).` : ''}
            {Number(searchParams.failed) > 0 ? ` ${searchParams.failed} failed to send.` : ''}
          </p>
        </section>
      ) : null}

      {recipients.length === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No clients yet. Once you&apos;ve created jobs or taken leads, your customers show up here and you can
            reach them in a couple of taps. <Link href="/dashboard/clients">See your clients →</Link>
          </p>
        </section>
      ) : (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">New campaign</p>
          </div>
          <CampaignComposer audiences={AUDIENCE_DEFS} reach={reach} initial={draft} />
        </section>
      )}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">History</p>
        </div>
        {campaigns.length === 0 ? (
          <p className="empty-state">No campaigns sent yet. Your past sends will be listed here.</p>
        ) : (
          <div className="campaign-history">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="campaign-history-row">
                <div className="campaign-history-main">
                  <strong>{campaign.subject || campaign.body.slice(0, 80)}</strong>
                  <span className="campaign-history-meta">
                    {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · {audienceLabel(campaign.audience)} · {formatDate(campaign.created_at)}
                  </span>
                </div>
                <div className="campaign-history-stats">
                  <span className="campaign-stat"><strong>{campaignSent(campaign)}</strong> sent</span>
                  {campaign.email_sent > 0 && campaign.sms_sent > 0 ? (
                    <span className="muted">{campaign.email_sent} email · {campaign.sms_sent} text</span>
                  ) : null}
                  {campaign.skipped_count > 0 ? <span className="muted">{campaign.skipped_count} skipped</span> : null}
                  {campaign.failed_count > 0 ? <span className="campaign-stat-fail">{campaign.failed_count} failed</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
