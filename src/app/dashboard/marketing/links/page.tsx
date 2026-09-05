import { requireOfficeContext } from '@/lib/auth';
import {
  aggregateCampaignAttribution,
  loadMarketingAttributionData,
  type JobFinancialLookup,
} from '@/lib/campaign-roi';
import LinkBuilderScreen, { type EnrichedTrackingCampaign } from './LinkBuilderScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign Link & QR Builder' };

export default async function LinkBuilderPage() {
  const { supabase, accountId } = await requireOfficeContext('marketing.read');

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

  const [{ data: accountRow }, { data: siteRow }, dbLinksRes, attributionData] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('subdomain, custom_domain, company_name').eq('account_id', accountId).maybeSingle(),
    supabase
      .from('marketing_tracking_links')
      .select('*')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then((res) => res, () => ({ data: [] as any[] })),
    loadMarketingAttributionData(supabase, accountId).catch(() => ({ leads: [], jobs: [] })),
  ]);

  const businessName = (siteRow?.company_name || accountRow?.business_name || 'Your Business').trim();

  let defaultBaseUrl = 'https://' + rootDomain;
  if (siteRow?.custom_domain) {
    defaultBaseUrl = `https://${siteRow.custom_domain}`;
  } else if (siteRow?.subdomain) {
    defaultBaseUrl = `https://${siteRow.subdomain}.${rootDomain}`;
  }

  const { leads, jobs } = attributionData;
  const jobLookup: JobFinancialLookup = {};
  for (const job of jobs) {
    const isWon = job.status === 'in_progress' || job.status === 'complete';
    jobLookup[job.id] = { total: Number(job.quoted_amount) || 0, isWon };
  }

  const rawLinks = (dbLinksRes?.data as any[]) || [];
  const targetCampaigns = rawLinks.map((row) => ({
    id: row.id,
    name: row.name,
    campaign: row.campaign,
    shortCode: row.short_code,
    content: row.content || undefined,
    scanCount: row.scan_count || 0,
    adSpend: Number(row.ad_spend) || 0,
  }));

  const metricsMap = aggregateCampaignAttribution(targetCampaigns, leads, jobLookup);

  const initialCampaigns: EnrichedTrackingCampaign[] = rawLinks.map((row) => {
    const m = metricsMap[row.id] || {
      visits: row.scan_count || 0,
      leads: 0,
      wonJobs: 0,
      revenue: 0,
      adSpend: Number(row.ad_spend) || 0,
      roas: 0,
    };
    return {
      id: row.id,
      shortCode: row.short_code,
      name: row.name,
      channelId: row.channel_id,
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      content: row.content || '',
      term: row.term || '',
      promo: row.promo || '',
      destinationUrl: row.destination_url,
      fullUrl: row.full_url,
      adSpend: m.adSpend,
      visits: m.visits,
      leads: m.leads,
      wonJobs: m.wonJobs,
      revenue: m.revenue,
      roas: m.roas,
      createdAt: row.created_at,
    };
  });

  return (
    <LinkBuilderScreen
      defaultBaseUrl={defaultBaseUrl}
      businessName={businessName}
      rootDomain={rootDomain}
      accountId={accountId}
      initialCampaigns={initialCampaigns}
    />
  );
}
