import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { buildInsights, resolvePeriod } from '@/lib/insights';
import { buildFillScheduleCopy, TEMPLATES } from '@/lib/campaign-templates';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import { loadArrivalAnalytics } from '@/lib/arrival-analytics-data';
import InsightsScreen from './InsightsScreen';

export const metadata = {
  title: 'Insights',
  description: 'What you earned, where work is getting stuck, and what to improve next.',
};

/**
 * Insights, for a signed-in owner.
 *
 * This file is now only the READ. Everything drawn from the numbers lives in
 * InsightsScreen, which the logged-out demo renders too — see the note there
 * for why that split exists.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { window?: string; from?: string; to?: string; compare?: string };
}) {
  const { supabase, accountId } = await requireOfficeContext('reports.read');
  const period = resolvePeriod(searchParams);
  const showDelta = searchParams.compare === 'prev';

  // The window/from/to the page is showing, forwarded to the export route so the
  // downloaded file matches exactly this view (compare is display-only).
  const exportParams = new URLSearchParams();
  if (searchParams.window) exportParams.set('window', searchParams.window);
  if (searchParams.from) exportParams.set('from', searchParams.from);
  if (searchParams.to) exportParams.set('to', searchParams.to);
  const exportQuery = exportParams.toString();

  // Account flag + published-site details in one round trip. business_name and
  // the site's company_name/subdomain are only needed to word and address the
  // schedule-filler campaign handoff below.
  const [{ data: account }, { data: siteRow }] = await Promise.all([
    supabase.from('accounts').select('arrival_updates_enabled, business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, published, subdomain').eq('account_id', accountId).maybeSingle(),
  ]);

  // job_tracking is owner-scoped by RLS; this page is already inside
  // requireOwnerContext. Arrival habits are measured over the same window.
  const arrivals = await loadArrivalAnalytics(createAdminClient(), accountId, period.days);
  const insights = await buildInsights(supabase, accountId, period, {
    arrivalUpdatesOn: Boolean(account?.arrival_updates_enabled),
    hasArrivalData: arrivals.summary.trips > 0,
  });

  // The schedule-filler campaign, drafted on the SERVER so the exact words the
  // owner is about to read don't get re-generated on arrival at the composer.
  // The identical draft feeds both Schedule Utilization's button and the
  // fill-schedule row of Top Opportunities, so the two can't drift apart. It
  // never sends — the button only opens the composer.
  const businessName = (siteRow?.company_name as string) || (account?.business_name as string) || 'your business';
  const origin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingUrl = siteRow?.published && siteRow?.subdomain ? `${origin}/book/${siteRow.subdomain}` : null;
  const fillMeta = TEMPLATES.find((template) => template.id === 'fill-next-week')!;
  const fillCopy = buildFillScheduleCopy({ businessName, openSlotCount: insights.scheduleUtilization.openDays, bookingUrl });
  const fillDraft: CampaignDraft = {
    channel: fillMeta.defaultChannel,
    audience: fillMeta.defaultAudience,
    subject: fillCopy.subject,
    subjectOptions: [],
    body: fillCopy.body,
    beatId: '',
    templateName: fillMeta.title,
    templateExplanation: fillMeta.oneLiner,
    sendTimeHint: fillMeta.sendTimeHint ?? undefined,
  };

  return (
    <InsightsScreen
      insights={insights}
      arrivals={arrivals}
      fillDraft={fillDraft}
      showDelta={showDelta}
      exportQuery={exportQuery}
      searchParams={searchParams}
    />
  );
}
