import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { getAuthoritativeTrade } from '@/lib/workspace-trade';
import { pickBusinessName } from '@/lib/business-name';
import { getInsuranceTradeProfile, shouldShowInsuranceFeatures } from '@/lib/trade-insurance';
import { listInsuranceClaimSummaries, getInsuranceClaim } from '@/lib/insurance-claims';
import { listJobs } from '@/lib/jobs';
import InsuranceClaimsClient from './InsuranceClaimsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Insurance Claims & Supplement Studio | LGQ Dashboard',
  description: 'AI-assisted adjuster scope parsing, building code supplement detection, and claim justification tools.',
};

export default async function InsuranceClaimsPage({
  searchParams,
}: {
  searchParams?: Promise<{ claim?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialClaimId = params?.claim || null;

  const { supabase, accountId, account, capabilities, role } = await requireOfficeContext('jobs.read');
  const admin = createAdminClient();

  // Load authoritative data without swallowing database errors
  const [trade, { data: site }, claimsList, rawJobs, clientsRes, balanceRes] = await Promise.all([
    getAuthoritativeTrade(admin, accountId),
    admin.from('sites').select('company_name, enable_insurance_intake').eq('account_id', accountId).maybeSingle(),
    listInsuranceClaimSummaries(supabase, accountId),
    listJobs(supabase, accountId),
    admin.from('clients').select('id, name, phone, email, address').eq('account_id', accountId).order('name').limit(500),
    supabase.from('workspace_usage_credit_balances').select('resource_code, available_units').eq('account_id', accountId),
  ]);

  // If a deep-linked claim was requested, load the full record
  let initialActiveClaim = null;
  if (initialClaimId) {
    try {
      initialActiveClaim = await getInsuranceClaim(supabase, accountId, initialClaimId);
    } catch {
      initialActiveClaim = null;
    }
  }

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

  const aiWritingUnits = balanceRes?.data?.find((r) => r.resource_code === 'ai_writing_drafts')?.available_units;

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
        initialAiCredits={typeof aiWritingUnits === 'number' ? aiWritingUnits : null}
        initialClaimId={initialClaimId}
        initialActiveClaim={initialActiveClaim}
      />
    </main>
  );
}
