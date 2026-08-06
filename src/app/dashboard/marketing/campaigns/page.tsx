import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import {
  AUDIENCE_DEFS,
  listCampaigns,
  loadListHealth,
  loadRecipients,
  matchesAudience,
  summarizeReach,
  type CampaignAudience,
  type Reach,
} from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';
import { campaignDraftForBeat } from '@/lib/marketing-draft-data';
import { buildCampaignRecommendations } from '@/lib/campaign-recommendations';
import MarketingNav from '../MarketingNav';
import CampaignWorkspace from './CampaignWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaigns' };

/**
 * Writing and sending one campaign, on its own screen.
 *
 * Lifted out of the marketing overview unchanged. The composer, its audience
 * picker, its reach counts, its guard and its history are the same components
 * doing the same job — what moved is where they live, so the overview can open
 * on an answer instead of on a blank form.
 *
 * The ?draft= handoff moved with them, because that is what the overview's
 * "Create email campaign" buttons point at.
 */
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { sent?: string; recipients?: string; skipped?: string; failed?: string; test?: string; draft?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [recipients, campaigns, listHealth, { data: accountRow }, { data: siteRow }] = await Promise.all([
    loadRecipients(supabase, accountId),
    listCampaigns(supabase, accountId),
    loadListHealth(supabase, accountId),
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, published, subdomain').eq('account_id', accountId).maybeSingle(),
  ]);

  const mailingAddress = resolveMarketingMailingAddress((accountRow?.mailing_address as string | null) ?? null);
  const businessName = (siteRow?.company_name as string) || (accountRow?.business_name as string) || 'your business';
  const origin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingUrl = siteRow?.published && siteRow?.subdomain ? `${origin}/book/${siteRow.subdomain}` : null;

  // Precompute reachable counts per audience × channel so the composer shows
  // live numbers without pulling any contact data into the client bundle.
  const now = Date.now();
  const reach = Object.fromEntries(
    AUDIENCE_DEFS.map((audience) => {
      const matched = recipients.filter((recipient) => matchesAudience(recipient, audience.id, now));
      return [audience.id, summarizeReach(matched)];
    }),
  ) as Record<CampaignAudience, Reach>;

  const recommendations =
    recipients.length > 0 ? await buildCampaignRecommendations(supabase, accountId, { recipients, reach, businessName, bookingUrl }) : null;


  // A draft handed over from the overview. Built here rather than passed through
  // the URL: the message depends on the account's own settings, and a
  // querystring carrying prose is a querystring somebody can rewrite.
  let draft:
    | { channel: 'email' | 'sms' | 'both'; audience: string; subject: string; subjectOptions?: string[]; body: string; beatId?: string }
    | undefined;
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
    draft = { channel: 'email', audience: 'past', subject: pitch.subject, body: pitch.body };
  } else if (searchParams.draft?.startsWith('beat:')) {
    draft = await campaignDraftForBeat(supabase, accountId, searchParams.draft.slice('beat:'.length));
  }

  const sentCount = searchParams.sent ? Number(searchParams.sent) : null;

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <section className="workspace-header-compact">
        <h1 className="workspace-title">Campaigns</h1>
        <p className="workspace-lead">Stay in touch with customers and keep your schedule full.</p>
      </section>

      {searchParams.test === '1' ? (
        <section className="panel workspace-section-card flash-banner flash-info">
          <p>Test email sent to your inbox. Take a look, then send the real thing when it&apos;s ready.</p>
        </section>
      ) : null}

      {sentCount !== null ? (
        <section className="panel workspace-section-card flash-banner flash-success">
          <p>
            Campaign sent to <strong>{sentCount}</strong> {sentCount === 1 ? 'message' : 'messages'} across{' '}
            {searchParams.recipients ?? 0} {Number(searchParams.recipients) === 1 ? 'customer' : 'customers'}.
            {Number(searchParams.skipped) > 0 ? ` ${searchParams.skipped} skipped (not reachable).` : ''}
            {Number(searchParams.failed) > 0 ? ` ${searchParams.failed} failed to send.` : ''}
          </p>
        </section>
      ) : null}

      {!mailingAddress ? (
        <section className="panel workspace-section-card flash-banner flash-warn">
          <p>
            Marketing email needs a physical postal address by law, and you don&apos;t have one on file — anything
            you write here can&apos;t be emailed until you add it.{' '}
            <Link href="/dashboard/settings">Add your mailing address →</Link>
          </p>
        </section>
      ) : null}

      <CampaignWorkspace
        campaigns={campaigns}
        hasRecipients={recipients.length > 0}
        recommendations={recommendations}
        composer={{
          audiences: AUDIENCE_DEFS,
          reach,
          initial: draft,
          mailingAddress,
          daysSinceLastSend: listHealth.daysSinceLastSend,
          unsubscribesSinceLastSend: listHealth.unsubscribesSinceLastSend,
        }}
      />
    </main>
  );
}
