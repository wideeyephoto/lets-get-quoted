import { requireOwnerContext } from '@/lib/auth';
import { isReferralConfigured } from '@/lib/referral';
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
import { marketingCalendarAction } from '../actions';
import CampaignsScreen from './CampaignsScreen';

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

  const [recipients, campaigns, listHealth, { data: accountRow }, { data: siteRow }, view] = await Promise.all([
    loadRecipients(supabase, accountId),
    listCampaigns(supabase, accountId),
    loadListHealth(supabase, accountId),
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, published, subdomain').eq('account_id', accountId).maybeSingle(),
    marketingCalendarAction(12),
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

  // Its own query, and allowed to come back empty. referral_reward arrives with
  // migrations/2026-08-25-referrals.sql, and a select naming a column that does
  // not exist errors rather than degrading — folding it into the account read
  // above would take the whole campaigns page down on a database that has not
  // had the migration yet. Same pattern, same reason, as mailing_address.
  const { data: referralRow } = await supabase.from('accounts').select('referral_reward').eq('id', accountId).maybeSingle();
  // AND the environment can actually sign. With no key nothing can be minted,
  // so the tracked copy would promise "we'll know it came from you" over a bare
  // booking URL that attributes nobody — worse than the untracked ask, because
  // the owner believes it is working.
  const referralReward = isReferralConfigured() ? ((referralRow?.referral_reward as string | null) ?? null) || null : null;

  const recommendations =
    recipients.length > 0
      ? await buildCampaignRecommendations(supabase, accountId, { recipients, reach, businessName, bookingUrl, referralReward })
      : null;


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

  return (
    <CampaignsScreen
      campaigns={campaigns}
      hasRecipients={recipients.length > 0}
      recommendations={recommendations}
      view={view}
      reach={reach}
      mailingAddress={mailingAddress}
      daysSinceLastSend={listHealth.daysSinceLastSend}
      unsubscribesSinceLastSend={listHealth.unsubscribesSinceLastSend}
      draft={draft}
      searchParams={searchParams}
    />
  );
}
