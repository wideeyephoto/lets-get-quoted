import { requireOfficeContext } from '@/lib/auth';
import {
  AUDIENCE_DEFS,
  listCampaigns,
  loadListHealth,
  loadRecipients,
  loadSentBeats,
  matchesAudience,
  summarizeReach,
  type CampaignAudience,
  type Reach,
} from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';
import { campaignDraftForBeat } from '@/lib/marketing-draft-data';
import { buildCampaignRecommendations } from '@/lib/campaign-recommendations';
import { buildCalendarView } from '@/lib/marketing-calendar-data';
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
  searchParams: { emailSent?: string; smsQueued?: string; recipients?: string; skipped?: string; failed?: string; test?: string; draft?: string };
}) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const [recipients, campaigns, listHealth, { data: accountRow }, { data: siteRow }, { data: serviceRows }, sentBeats, { data: balanceRows }] = await Promise.all([
    loadRecipients(supabase, accountId),
    listCampaigns(supabase, accountId),
    loadListHealth(supabase, accountId),
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, published, subdomain, content, service_area').eq('account_id', accountId).maybeSingle(),
    supabase.from('services').select('id, name, created_at, active').eq('account_id', accountId).eq('active', true),
    loadSentBeats(supabase, accountId),
    supabase.from('workspace_usage_credit_balances').select('resource_code, available_units').eq('account_id', accountId),
  ]);

  const emailUnits = balanceRows?.find((r) => r.resource_code === 'marketing_email_sends')?.available_units;
  const smsUnits = balanceRows?.find((r) => r.resource_code === 'text_segments')?.available_units;
  const availableEmailCredits = typeof emailUnits === 'number' && Number.isFinite(emailUnits) ? Math.max(0, emailUnits) : null;
  const availableSmsCredits = typeof smsUnits === 'number' && Number.isFinite(smsUnits) ? Math.max(0, smsUnits) : null;

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

  const services = (serviceRows ?? []) as Array<{ name: string; created_at: string; active?: boolean }>;
  const serviceNames = services.map((s) => s.name);

  const [view, recommendations] = await Promise.all([
    buildCalendarView(supabase, accountId, 4, {
      recipients,
      sentBeats,
      serviceNames,
      account: accountRow,
      site: siteRow,
    }),
    recipients.length > 0
      ? buildCampaignRecommendations(supabase, accountId, {
          recipients,
          reach,
          businessName,
          bookingUrl,
          siteContent: (siteRow?.content as Record<string, unknown> | null) ?? null,
          serviceArea: (siteRow?.service_area as string | null) ?? null,
          mailingAddress: (accountRow?.mailing_address as string | null) ?? null,
          services,
        })
      : Promise.resolve(null),
  ]);


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
      availableEmailCredits={availableEmailCredits}
      availableSmsCredits={availableSmsCredits}
      draft={draft}
      searchParams={searchParams}
    />
  );
}
