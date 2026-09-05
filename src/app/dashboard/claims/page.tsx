import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { getAuthoritativeTrade } from '@/lib/workspace-trade';
import { pickBusinessName } from '@/lib/business-name';
import { getInsuranceTradeProfile, shouldShowInsuranceFeatures } from '@/lib/trade-insurance';
import { listInsuranceClaims } from '@/lib/insurance-claims';
import { listJobs } from '@/lib/jobs';
import InsuranceClaimsClient from './InsuranceClaimsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Insurance Claims & Supplement Studio | LGQ Dashboard',
  description: 'AI-assisted adjuster scope parsing, building code supplement detection, and claim justification tools.',
};

export default async function InsuranceClaimsPage() {
  const { supabase, accountId, account, capabilities, role } = await requireOfficeContext('jobs.read');
  const admin = createAdminClient();

  const [trade, { data: site }, claimsList, rawJobs, clientsRes] = await Promise.all([
    getAuthoritativeTrade(admin, accountId),
    admin.from('sites').select('company_name, enable_insurance_intake').eq('account_id', accountId).maybeSingle(),
    listInsuranceClaims(supabase, accountId).catch(() => []),
    listJobs(supabase, accountId).catch(() => []),
    admin.from('clients').select('id, name, phone, email, address').eq('account_id', accountId).order('name').limit(100),
  ]);

  const businessName = pickBusinessName(site, account, 'Our Company');

  const tradeSlug = (trade || 'roofers').toLowerCase().replace(/\s+/g, '-');
  const profile = getInsuranceTradeProfile(tradeSlug);

  const claimsEnabled = shouldShowInsuranceFeatures({
    trade: tradeSlug,
    trade_slug: tradeSlug,
    enable_insurance_intake: site?.enable_insurance_intake,
  });

  const canWrite = role === 'owner' || capabilities.has('jobs.write');

  const activeJobs = (rawJobs || []).map((j) => ({
    id: j.id,
    label: `${j.ref ? `#${j.ref} - ` : ''}${j.client_name}${j.address ? ` (${j.address})` : ''}`,
    status: j.status,
    clientId: j.client_id || null,
  }));

  const clients = (clientsRes?.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
  }));

  return (
    <main className="wide-shell workspace-shell">
      <InsuranceClaimsClient
        tradeSlug={profile.tradeSlug}
        businessName={businessName}
        initialSiteClaimsEnabled={claimsEnabled}
        initialClaims={claimsList}
        clients={clients}
        jobs={activeJobs}
        canWrite={canWrite}
      />
    </main>
  );
}
