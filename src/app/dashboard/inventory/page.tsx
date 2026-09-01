import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import { loadInventoryData } from '@/lib/inventory-db';
import { listCrew } from '@/lib/crew';
import { listJobs } from '@/lib/jobs';
import InventoryClient from './InventoryClient';

export const metadata = {
  title: 'Inventory & Fleet Equipment | LGQ Dashboard',
  description: 'Manage tool custody, fleet vehicle maintenance, and multi-location van stock replenishment.',
};

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  const admin = createAdminClient();

  const [{ data: account }, { data: site }, inventoryPayload, crewList, jobsList] = await Promise.all([
    admin.from('accounts').select('business_name, company_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    loadInventoryData(supabase, accountId),
    listCrew(supabase, accountId).catch(() => []),
    listJobs(supabase, accountId).catch(() => []),
  ]);

  const businessName = pickBusinessName(site, account, 'Our Company');

  const crewMembers = (crewList || [])
    .filter((c) => c.active !== false && !c.deleted_at)
    .map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role_label,
    }));

  const activeJobs = (jobsList || []).map((j) => ({
    id: j.id,
    label: `${j.ref ? `#${j.ref} - ` : ''}${j.client_name}${j.address ? ` (${j.address})` : ''}`,
    status: j.status,
  }));

  return (
    <main className="min-h-screen bg-stone-50/50 dark:bg-stone-950/50 pb-16 pt-4">
      <InventoryClient
        businessName={businessName}
        initialPayload={inventoryPayload}
        crewMembers={crewMembers}
        activeJobs={activeJobs}
      />
    </main>
  );
}
