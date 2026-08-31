import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { getAuthoritativeTrade } from '@/lib/workspace-trade';
import { pickBusinessName } from '@/lib/business-name';
import { getInsuranceTradeProfile } from '@/lib/trade-insurance';
import InsuranceClaimsClient from './InsuranceClaimsClient';

export const metadata = {
  title: 'Insurance Claims & Supplement Studio | LGQ Dashboard',
  description: 'AI-assisted adjuster scope parsing, building code supplement detection, and claim justification tools.',
};

export default async function InsuranceClaimsPage() {
  const { accountId } = await requireOfficeContext();
  const admin = createAdminClient();

  const [trade, { data: account }, { data: site }] = await Promise.all([
    getAuthoritativeTrade(admin, accountId),
    admin.from('accounts').select('business_name, company_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = pickBusinessName(site, account, 'Our Company');

  const tradeSlug = (trade || 'roofers').toLowerCase().replace(/\s+/g, '-');
  const profile = getInsuranceTradeProfile(tradeSlug);

  return (
    <main className="min-h-screen bg-stone-50/50 pb-16 pt-4">
      <InsuranceClaimsClient
        tradeSlug={profile.tradeSlug}
        businessName={businessName}
        initialSiteClaimsEnabled={true}
      />
    </main>
  );
}
