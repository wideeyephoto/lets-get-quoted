import { requireOfficeContext } from '@/lib/auth';
import { getSiteContent, getPublishedServices } from '@/lib/site-content';
import { getAuthoritativeTrade } from '@/lib/workspace-trade';
import { stateFromAddress } from '@/lib/marketing-calendar';
import ManagedAdsScreen from './ManagedAdsScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Google Search Ads Autopilot' };

export default async function ManagedAdsPage(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const initialTab = typeof searchParams?.tab === 'string' ? searchParams.tab : undefined;
  const { supabase, accountId } = await requireOfficeContext('marketing.read');

  const [{ data: accountRow }, { data: siteRow }, trade] = await Promise.all([
    supabase.from('accounts').select('business_name, mailing_address, phone').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('subdomain, custom_domain, company_name, content').eq('account_id', accountId).maybeSingle(),
    getAuthoritativeTrade(supabase, accountId),
  ]);

  const content = getSiteContent(siteRow?.content as Record<string, unknown> | null);
  const businessName = (siteRow?.company_name || accountRow?.business_name || 'Your Business').trim();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

  let domain = rootDomain;
  if (siteRow?.custom_domain) {
    domain = siteRow.custom_domain;
  } else if (siteRow?.subdomain) {
    domain = `${siteRow.subdomain}.${rootDomain}`;
  }

  const publishedServices = (getPublishedServices(siteRow?.content as Record<string, unknown> | null)?.items ?? []).map((s) => s.title);
  const fallbackServices = publishedServices.length > 0
    ? publishedServices
    : ['Emergency Repairs', 'Installation & Replacement', 'Free Inspections', 'Maintenance'];

  const rawAddress = (accountRow?.mailing_address as string | null) || '';
  const state = stateFromAddress(rawAddress);
  const city = rawAddress ? rawAddress.split(',')[0]?.trim() + (state ? `, ${state}` : '') : 'Local Area';
  const phone = (accountRow?.phone as string | null) || '';

  const effectiveTrade = (trade || content.trade || 'Home Services').trim();
  const tradeSlug = effectiveTrade.toLowerCase().replace(/[^a-z0-9]/g, '');

  return (
    <ManagedAdsScreen
      businessName={businessName}
      trade={effectiveTrade}
      tradeSlug={tradeSlug}
      city={city}
      domain={domain}
      phone={phone}
      availableServices={fallbackServices}
      initialWalletState={(content as Record<string, unknown>).adCampaign as never}
      leadFilters={content.leadFilters}
      initialTab={initialTab}
    />
  );
}
