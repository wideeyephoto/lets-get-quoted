import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { getAuthoritativeTrade } from '@/lib/workspace-trade';
import { pickBusinessName } from '@/lib/business-name';
import { getInsuranceTradeProfile } from '@/lib/trade-insurance';
import InsuranceClaimsClient from './InsuranceClaimsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Insurance Claims & Supplement Studio | LGQ Dashboard',
  description: 'AI-assisted adjuster scope parsing, building code supplement detection, and claim justification tools.',
};

export default async function InsuranceClaimsPage() {
  const { accountId, account } = await requireOfficeContext('jobs.read');
  const admin = createAdminClient();

  const [trade, { data: site }] = await Promise.all([
    getAuthoritativeTrade(admin, accountId),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = pickBusinessName(site, account, 'Our Company');

  const tradeSlug = (trade || 'roofers').toLowerCase().replace(/\s+/g, '-');
  const profile = getInsuranceTradeProfile(tradeSlug);

  return (
    <main className="wide-shell workspace-shell">
      <InsuranceClaimsClient
        tradeSlug={profile.tradeSlug}
        businessName={businessName}
        initialSiteClaimsEnabled={true}
      />
    </main>
  );
}
